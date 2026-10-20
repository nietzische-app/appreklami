import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";
import { TIERS, outputFileName, resolutionOf } from "../shared/tiers";
import type { JobState, Plan, SourceInput, VideoState } from "../shared/types";
import { config } from "./config";

export const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
export const isTerminal = (job: JobState) => TERMINAL.has(job.status);

const jobFile = (jobId: string) => path.join(config.rendersDir, jobId, "job.json");

/** In-memory job registry (mirrored to public/renders/<jobId>/job.json) that emits change events for SSE. */
class JobStore extends EventEmitter {
  private jobs = new Map<string, JobState>();

  create(jobId: string, source: SourceInput, plan: Plan): JobState {
    const now = new Date().toISOString();
    const videos: VideoState[] = TIERS.map((tier) => {
      const locked = tier.premium && plan !== "pro";
      return {
        tier: tier.id,
        option: tier.option,
        label: tier.label,
        status: locked ? "skipped" : "pending",
        progress: 0,
        resolution: resolutionOf(tier),
        watermark: tier.watermark,
        ...(locked ? { error: "PRO plan required" } : {}),
      };
    });
    const job: JobState = { jobId, status: "queued", progress: 0, plan, source, videos, createdAt: now, updatedAt: now };
    this.jobs.set(jobId, job);
    void this.persist(job);
    return job;
  }

  async get(jobId: string): Promise<JobState | undefined> {
    const live = this.jobs.get(jobId);
    if (live) return live;
    try {
      const job = JSON.parse(await fs.readFile(jobFile(jobId), "utf8")) as JobState;
      if (!isTerminal(job)) {
        // Process died mid-job; nothing is running it anymore.
        job.status = "failed";
        job.error = "Job was interrupted by a server restart.";
      }
      return job;
    } catch {
      return undefined;
    }
  }

  /** Applies a mutation, recomputes overall progress and notifies subscribers (only on visible changes). */
  update(jobId: string, mutate: (job: JobState) => void): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const before = JSON.stringify([job.status, job.progress, job.videos.map((v) => [v.status, v.progress, v.url, v.error])]);
    mutate(job);
    job.progress = computeProgress(job);
    const after = JSON.stringify([job.status, job.progress, job.videos.map((v) => [v.status, v.progress, v.url, v.error])]);
    if (before === after) return;
    job.updatedAt = new Date().toISOString();
    void this.persist(job);
    this.emit(jobId, job);
  }

  subscribe(jobId: string, listener: (job: JobState) => void): () => void {
    this.on(jobId, listener);
    return () => this.off(jobId, listener);
  }

  private async persist(job: JobState): Promise<void> {
    try {
      await fs.mkdir(path.dirname(jobFile(job.jobId)), { recursive: true });
      await fs.writeFile(jobFile(job.jobId), JSON.stringify(job, null, 2));
    } catch (err) {
      console.error(`[jobs] could not persist ${job.jobId}:`, err);
    }
  }
}

const ANALYSIS_WEIGHT = 5;

/** Analysis is the first 5%; the remaining 95% is split evenly over the videos that will be rendered. */
export function computeProgress(job: JobState): number {
  if (job.status === "completed") return 100;
  if (job.status === "queued") return 0;
  if (job.status === "cancelled") return job.progress;
  const active = job.videos.filter((v) => v.status !== "skipped");
  if (active.length === 0) return job.status === "analyzing" ? 0 : ANALYSIS_WEIGHT;
  const analysisDone = job.status === "analyzing" ? 0 : ANALYSIS_WEIGHT;
  const perVideo = (100 - ANALYSIS_WEIGHT) / active.length;
  const rendered = active.reduce((sum, v) => sum + (v.status === "completed" ? 1 : v.progress / 100), 0);
  return Math.min(99, Math.floor(analysisDone + rendered * perVideo));
}

export const jobStore = new JobStore();
jobStore.setMaxListeners(0);
export { outputFileName };
