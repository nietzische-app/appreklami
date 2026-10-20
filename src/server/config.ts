import path from "node:path";
import type { Plan } from "../shared/types";

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  port: int(process.env.PORT, 3000),
  host: process.env.HOST ?? "0.0.0.0",
  rendersDir: path.resolve(process.env.RENDERS_DIR ?? "public/renders"),
  /** Per-job scratch dirs (Remotion public dir with sfx + staged project images). */
  workDir: path.resolve(process.env.WORK_DIR ?? "storage/jobs"),
  assetsDir: path.resolve("assets"),
  remotionEntry: path.resolve("src/remotion/index.ts"),
  remotionBin: path.resolve("node_modules/.bin/remotion"),
  /** How many jobs may render at the same time. Videos inside a job are always sequential. */
  jobConcurrency: int(process.env.JOB_CONCURRENCY, 1),
  renderConcurrency: process.env.RENDER_CONCURRENCY,
  renderTimeoutMs: int(process.env.RENDER_TIMEOUT_MS, 20 * 60_000),
  /**
   * Placeholder for real auth/billing: the plan every request gets. With
   * ALLOW_PLAN_OVERRIDE=1 a client may send `X-Plan: free|pro` (dev/testing only).
   */
  defaultPlan: (process.env.DEFAULT_PLAN === "free" ? "free" : "pro") as Plan,
  /** Comma-separated origins allowed to call the API from a browser (e.g. the Netlify site). "*" allows all. */
  corsOrigins: (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  /** Max new jobs per client IP per hour (0 = unlimited). */
  rateLimitPerHour: Number(process.env.RATE_LIMIT_PER_HOUR ?? 5),
  /** Rendered jobs older than this are deleted (disk protection on a shared server). 0 = keep forever. */
  retentionHours: Number(process.env.RENDER_RETENTION_HOURS ?? 24),
  maxQueuedJobs: int(process.env.MAX_QUEUED_JOBS, 20),
  /** Prefix for URLs returned to clients; set when the API is served from a different origin. */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
  /** Free plan: render a short blurred teaser of the PRO video (PRO_PREVIEW=0 turns it off). */
  proPreview: process.env.PRO_PREVIEW !== "0",
  allowPlanOverride: process.env.ALLOW_PLAN_OVERRIDE === "1",
};
