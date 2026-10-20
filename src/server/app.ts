import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { z } from "zod";
import { analyzeProject, resolveSource, SourceError } from "../analyzer";
import { validateSource } from "../analyzer/source";
import type { Plan } from "../shared/types";
import { config } from "./config";
import { JOB_ID_RE, isTerminal, jobStore } from "./jobStore";
import { newJobId, runJob } from "./pipeline";
import { jobQueue } from "./queue";

const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("github"), url: z.string().min(1).max(300) }),
  z.object({ type: z.literal("local"), path: z.string().min(1).max(500) }),
]);
const generateSchema = z.object({ source: sourceSchema });

/** Auth/billing seam: replace with the real plan lookup for the authenticated user. */
function resolvePlan(req: Request): Plan {
  const header = req.header("x-plan");
  if (config.allowPlanOverride && (header === "free" || header === "pro")) return header;
  return config.defaultPlan;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.use("/renders", express.static(config.rendersDir, { index: false, fallthrough: true }));
  app.use(express.static(path.resolve("public"), { index: "index.html" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, queued: jobQueue.size });
  });

  /** Analysis only (no rendering): handy for previewing the generated storyboards. */
  app.post("/api/analyze", async (req, res, next) => {
    try {
      const { source } = generateSchema.parse(req.body);
      const resolved = await resolveSource(source);
      try {
        const analysis = await analyzeProject(resolved.root, resolved.displayName);
        res.json({ ...analysis, images: analysis.images.map((p) => path.relative(resolved.root, p)) });
      } finally {
        await resolved.cleanup();
      }
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/generate-videos", async (req, res, next) => {
    try {
      const { source } = generateSchema.parse(req.body);
      await validateSource(source);

      const plan = resolvePlan(req);
      const jobId = newJobId();
      const job = jobStore.create(jobId, source, plan);
      jobQueue.enqueue(() => runJob(jobId, source, plan));

      res.status(202).json({
        jobId,
        status: job.status,
        plan,
        statusUrl: `/api/jobs/${jobId}`,
        eventsUrl: `/api/jobs/${jobId}/events`,
        outputDir: `/renders/${jobId}/`,
        videos: job.videos,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Polling endpoint. */
  app.get("/api/jobs/:jobId", async (req, res) => {
    const job = JOB_ID_RE.test(req.params.jobId) ? await jobStore.get(req.params.jobId) : undefined;
    if (!job) return void res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  /** Server-Sent Events stream: one `progress` event per visible change, then `done`. */
  app.get("/api/jobs/:jobId/events", async (req, res) => {
    const job = JOB_ID_RE.test(req.params.jobId) ? await jobStore.get(req.params.jobId) : undefined;
    if (!job) return void res.status(404).json({ error: "Job not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n\n");

    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const finish = (state: typeof job) => {
      send("done", state);
      cleanup();
      res.end();
    };

    const unsubscribe = jobStore.subscribe(job.jobId, (state) => {
      send("progress", state);
      if (isTerminal(state)) finish(state);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
    function cleanup() {
      clearInterval(heartbeat);
      unsubscribe();
    }
    req.on("close", cleanup);

    send("progress", job);
    if (isTerminal(job)) finish(job);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      return void res.status(400).json({ error: "Invalid request body", details: err.issues });
    }
    if (err instanceof SourceError) return void res.status(400).json({ error: err.message });
    if ((err as { type?: string }).type === "entity.parse.failed") {
      return void res.status(400).json({ error: "Malformed JSON body" });
    }
    console.error("[api] unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
