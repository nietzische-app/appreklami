import path from "node:path";
import type { Plan } from "../shared/types";

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  port: int(process.env.PORT, 3000),
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
  allowPlanOverride: process.env.ALLOW_PLAN_OVERRIDE === "1",
};
