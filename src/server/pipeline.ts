import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzeProject, resolveSource } from "../analyzer";
import { normalizeVideoProps } from "../remotion/props";
import { PALETTES } from "../remotion/theme";
import { TIERS, outputFileName } from "../shared/tiers";
import type { MediaAsset, Plan, ProjectAnalysis, SourceInput, TierConfig, VideoProps } from "../shared/types";
import { config } from "./config";
import { jobStore } from "./jobStore";
import { degradeMedia, prepareMedia } from "./media-prep";
import { CancelledError, RenderError, renderWithRemotionCli } from "./renderer";

const SAFE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".webm", ".mp4"]);

/** Builds the per-job Remotion public dir: shared sfx + the project's media. Returns media with public-dir-relative paths. */
async function stageAssets(jobId: string, analysis: ProjectAnalysis): Promise<{ publicDir: string; media: MediaAsset[] }> {
  const publicDir = path.join(config.workDir, jobId, "public");
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.mkdir(path.join(publicDir, "media"), { recursive: true });
  await fs.cp(path.join(config.assetsDir, "sfx"), path.join(publicDir, "sfx"), { recursive: true });

  const copy = async (src: string, name: string): Promise<string | undefined> => {
    const ext = path.extname(src).toLowerCase();
    if (!SAFE_EXT.has(ext)) return undefined;
    const rel = `media/${name}${ext}`;
    await fs.copyFile(src, path.join(publicDir, rel));
    return rel;
  };

  const media: MediaAsset[] = [];
  for (const [i, m] of analysis.media.entries()) {
    try {
      const src = await copy(m.src, `m${i + 1}`);
      if (!src) continue;
      const poster = m.poster ? await copy(m.poster, `m${i + 1}-poster`).catch(() => undefined) : undefined;
      const ready = await prepareMedia(publicDir, { ...m, src, poster }, analysis.mediaNotes);
      if (ready) media.push(ready);
    } catch (err) {
      analysis.mediaNotes.push(`media skipped: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  return { publicDir, media };
}

export function buildVideoProps(analysis: ProjectAnalysis, tier: TierConfig, media: MediaAsset[], index: number): VideoProps {
  const story = analysis.storyboards[index % analysis.storyboards.length];
  return normalizeVideoProps({
    projectName: analysis.name,
    projectType: analysis.projectType,
    tagline: analysis.tagline,
    hook: story.hook,
    features: story.features,
    outro: story.outro,
    cta: story.cta,
    media,
    watermark: tier.watermark,
    ...PALETTES[analysis.projectType],
  });
}

/**
 * Renders one video. If Remotion fails because of media (broken recording, unreadable image) the render is retried with
 * safer media: first videos become screenshots, then everything becomes the generated UI. A job therefore only fails for
 * problems that are not caused by the media.
 */
export async function renderWithFallback(
  jobId: string,
  index: number,
  tier: TierConfig,
  analysis: ProjectAnalysis,
  media: MediaAsset[],
  publicDir: string,
  outFile: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const attempts: MediaAsset[][] = [media];
  for (const level of [1, 2] as const) {
    const next = degradeMedia(media, level);
    if (next.length !== attempts[attempts.length - 1].length || next.some((m, i) => m !== attempts[attempts.length - 1][i])) attempts.push(next);
  }

  let lastError: unknown;
  for (const [attempt, attemptMedia] of attempts.entries()) {
    const propsFile = path.join(config.workDir, jobId, `props-${tier.id}-${attempt}.json`);
    await fs.writeFile(propsFile, JSON.stringify(buildVideoProps(analysis, tier, attemptMedia, index)));
    try {
      await renderWithRemotionCli({
        tier,
        publicDir,
        propsFile,
        outFile,
        signal,
        onProgress: (pct) =>
          jobStore.update(jobId, (j) => {
            j.videos[index].progress = pct;
          }),
      });
      return;
    } catch (err) {
      lastError = err;
      const retryable = err instanceof RenderError && err.kind === "media" && attempt < attempts.length - 1;
      if (!retryable) throw err;
      console.warn(`[render] job ${jobId} ${tier.id}: media error, retrying with safer media (attempt ${attempt + 2}/${attempts.length})`);
      jobStore.update(jobId, (j) => {
        j.videos[index].progress = 0;
      });
    }
  }
  throw lastError;
}

const controllers = new Map<string, AbortController>();

/** Registers the abort controller at enqueue time so queued jobs can be cancelled too. */
export function registerJob(jobId: string): void {
  controllers.set(jobId, new AbortController());
}

/** Returns false if the job is unknown or already finished. */
export function cancelJob(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (!controller || controller.signal.aborted) return false;
  controller.abort();
  jobStore.update(jobId, (j) => {
    j.status = "cancelled";
    j.error = "Cancelled by user.";
    for (const v of j.videos) if (v.status === "pending" || v.status === "rendering") v.status = "cancelled";
  });
  return true;
}

export async function runJob(jobId: string, source: SourceInput, plan: Plan): Promise<void> {
  const signal = controllers.get(jobId)?.signal;
  if (signal?.aborted) return void controllers.delete(jobId);
  const outDir = path.join(config.rendersDir, jobId);
  await fs.mkdir(outDir, { recursive: true });
  let cleanup: () => Promise<void> = async () => {};

  try {
    jobStore.update(jobId, (j) => {
      j.status = "analyzing";
    });
    const resolved = await resolveSource(source, signal);
    cleanup = resolved.cleanup;
    const analysis = await analyzeProject(resolved.root, resolved.displayName, resolved.preferDisplayName);
    const { publicDir, media } = await stageAssets(jobId, analysis);
    await resolved.cleanup();
    if (analysis.tempDir) await fs.rm(analysis.tempDir, { recursive: true, force: true });
    cleanup = async () => {};

    if (signal?.aborted) throw new CancelledError();
    jobStore.update(jobId, (j) => {
      j.analysis = {
        name: analysis.name,
        tagline: analysis.tagline,
        projectType: analysis.projectType,
        confidence: analysis.confidence,
        storyboards: analysis.storyboards,
        imageCount: media.length,
        mediaOrigin: analysis.mediaOrigin,
        liveUrl: analysis.liveUrl,
        copySource: analysis.copySource,
      };
      j.status = "rendering";
    });

    for (const [index, tier] of TIERS.entries()) {
      if (tier.premium && plan !== "pro") continue;

      jobStore.update(jobId, (j) => {
        j.videos[index].status = "rendering";
        j.videos[index].progress = 0;
      });
      const fileName = outputFileName(tier);

      try {
        await renderWithFallback(jobId, index, tier, analysis, media, publicDir, path.join(outDir, fileName), signal);
      } catch (err) {
        if (err instanceof CancelledError || signal?.aborted) throw new CancelledError();
        const message = (err as Error).message;
        console.error(`[render] job ${jobId} ${tier.id} failed: ${message}${err instanceof RenderError ? `\n${err.detail}` : ""}`);
        jobStore.update(jobId, (j) => {
          j.videos[index].status = "failed";
          j.videos[index].error = message;
        });
        continue;
      }
      jobStore.update(jobId, (j) => {
        j.videos[index].status = "completed";
        j.videos[index].progress = 100;
        j.videos[index].url = `/renders/${jobId}/${fileName}`;
      });
    }

    if (signal?.aborted) throw new CancelledError();
    jobStore.update(jobId, (j) => {
      const anyDone = j.videos.some((v) => v.status === "completed");
      j.status = anyDone ? "completed" : "failed";
      if (!anyDone) j.error = "All renders failed.";
    });
  } catch (err) {
    if (!(err instanceof CancelledError) && !signal?.aborted) {
      jobStore.update(jobId, (j) => {
        j.status = "failed";
        j.error = (err as Error).message;
      });
    }
  } finally {
    controllers.delete(jobId);
    await cleanup();
    await fs.rm(path.join(config.workDir, jobId), { recursive: true, force: true }).catch(() => {});
  }
}

export const newJobId = () => randomUUID();
