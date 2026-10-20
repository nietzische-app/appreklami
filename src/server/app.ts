import { promises as fs } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { z } from "zod";
import { analyzeProject, resolveSource, SourceError } from "../analyzer";
import { sanitizeIntent } from "../analyzer/intent";
import { allowedLocalRoots, validateSource } from "../analyzer/source";
import { DURATION_SECONDS, TIERS, resolutionOf } from "../shared/tiers";
import type { Plan } from "../shared/types";
import { config } from "./config";
import { JOB_ID_RE, isTerminal, jobStore } from "./jobStore";
import { cancelJob, newJobId, registerJob, runJob } from "./pipeline";
import { jobQueue } from "./queue";

const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("github"), url: z.string().min(1).max(300) }),
  z.object({ type: z.literal("local"), path: z.string().min(1).max(500) }),
]);
const intentSchema = z
  .object({
    projectDescription: z.string().max(1000).optional(),
    keyFeature: z.string().max(200).optional(),
    targetAudience: z.string().max(40).optional(),
  })
  .optional();
const generateSchema = z.object({ source: sourceSchema, intent: intentSchema });

/** Auth/billing seam: replace with the real plan lookup for the authenticated user. */
function resolvePlan(req: Request): Plan {
  const header = req.header("x-plan");
  if (config.allowPlanOverride && (header === "free" || header === "pro")) return header;
  return config.defaultPlan;
}

const originPatterns = config.corsOrigins.map((entry) =>
  entry === "*" ? /^.*$/ : new RegExp(`^${entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+")}$`, "i"),
);
/** CORS_ORIGIN entries may use `*` inside the host, e.g. https://*--my-site.netlify.app for Netlify branch/preview deploys. */
export const isOriginAllowed = (origin: string) => originPatterns.some((re) => re.test(origin));

class RateLimitError extends Error {}
const hits = new Map<string, number[]>();

function enforceLimits(ip: string): void {
  if (jobQueue.size >= config.maxQueuedJobs) throw new RateLimitError("The render queue is full, please try again in a few minutes.");
  if (!config.rateLimitPerHour) return;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= config.rateLimitPerHour) {
    throw new RateLimitError(`Limit reached: ${config.rateLimitPerHour} video sets per hour. Please try again later.`);
  }
  recent.push(now);
  hits.set(ip, recent);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const origin = req.header("origin");
    const allowed = origin && isOriginAllowed(origin);
    if (origin && allowed) {
      res.setHeader("Access-Control-Allow-Origin", config.corsOrigins.includes("*") ? "*" : origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Plan");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.use("/renders", express.static(config.rendersDir, { index: false, fallthrough: true }));
  app.use(express.static(path.resolve("public"), { index: "index.html" }));

  /** Lets the web UI adapt (e.g. hide the local-folder tab on a public server). */
  app.get("/api/config", (_req, res) => {
    res.json({
      localSources: allowedLocalRoots().length > 0,
      plan: config.defaultPlan,
      tiers: TIERS.map((t) => ({ option: t.option, id: t.id, label: t.label, resolution: resolutionOf(t), watermark: t.watermark, premium: t.premium })),
      durationSeconds: DURATION_SECONDS,
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, queued: jobQueue.size });
  });

  /** Analysis only (no rendering): handy for previewing the generated storyboards. */
  app.post("/api/analyze", async (req, res, next) => {
    try {
      const { source, intent: rawIntent } = generateSchema.parse(req.body);
      const intent = sanitizeIntent(rawIntent);
      const resolved = await resolveSource(source);
      let tempDir: string | undefined;
      try {
        const analysis = await analyzeProject(resolved.root, resolved.displayName, resolved.preferDisplayName, { intent });
        tempDir = analysis.tempDir;
        const { tempDir: _omit, ...publicAnalysis } = analysis;
        res.json({
          ...publicAnalysis,
          media: analysis.media.map((m) => ({ ...m, src: path.basename(m.src), poster: m.poster ? path.basename(m.poster) : undefined })),
        });
      } finally {
        await resolved.cleanup();
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/generate-videos", async (req, res, next) => {
    try {
      const { source, intent: rawIntent } = generateSchema.parse(req.body);
      const intent = sanitizeIntent(rawIntent);
      await validateSource(source);

      enforceLimits(req.ip ?? "unknown");
      const plan = resolvePlan(req);
      const jobId = newJobId();
      const job = jobStore.create(jobId, source, plan, intent);
      registerJob(jobId);
      jobQueue.enqueue(() => runJob(jobId, source, plan, intent));

      res.status(202).json({
        jobId,
        status: job.status,
        plan,
        statusUrl: `/api/jobs/${jobId}`,
        eventsUrl: `/api/jobs/${jobId}/events`,
        outputDir: `${config.publicBaseUrl}/renders/${jobId}/`,
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

  /** Stops a queued/running job (kills the Remotion process) and marks it cancelled. */
  app.post("/api/jobs/:jobId/cancel", async (req, res) => {
    const job = JOB_ID_RE.test(req.params.jobId) ? await jobStore.get(req.params.jobId) : undefined;
    if (!job) return void res.status(404).json({ error: "Job not found" });
    if (isTerminal(job) || !cancelJob(job.jobId)) return void res.status(409).json({ error: "Job already finished" });
    res.json(await jobStore.get(job.jobId));
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
    if (err instanceof RateLimitError) return void res.status(429).json({ error: err.message });
    if (err instanceof SourceError) return void res.status(400).json({ error: err.message });
    if ((err as { type?: string }).type === "entity.parse.failed") {
      return void res.status(400).json({ error: "Malformed JSON body" });
    }
    console.error("[api] unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
