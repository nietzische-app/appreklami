import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzeProject, resolveSource } from "../analyzer";
import { PALETTES } from "../remotion/theme";
import { TIERS, outputFileName } from "../shared/tiers";
import type { Plan, ProjectAnalysis, SourceInput, TierConfig, VideoProps } from "../shared/types";
import { config } from "./config";
import { jobStore } from "./jobStore";
import { CancelledError, renderWithRemotionCli } from "./renderer";

const SAFE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Builds the per-job Remotion public dir: shared sfx + the project's own images. Returns relative image paths. */
async function stageAssets(jobId: string, analysis: ProjectAnalysis): Promise<{ publicDir: string; images: string[] }> {
  const publicDir = path.join(config.workDir, jobId, "public");
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.mkdir(path.join(publicDir, "images"), { recursive: true });
  await fs.cp(path.join(config.assetsDir, "sfx"), path.join(publicDir, "sfx"), { recursive: true });

  const images: string[] = [];
  for (const [i, src] of analysis.images.entries()) {
    const ext = path.extname(src).toLowerCase();
    if (!SAFE_EXT.has(ext)) continue;
    const rel = `images/img-${i + 1}${ext}`;
    await fs.copyFile(src, path.join(publicDir, rel));
    images.push(rel);
  }
  return { publicDir, images };
}

export function buildVideoProps(analysis: ProjectAnalysis, tier: TierConfig, images: string[], index: number): VideoProps {
  const story = analysis.storyboards[index % analysis.storyboards.length];
  return {
    projectName: analysis.name,
    projectType: analysis.projectType,
    tagline: analysis.tagline,
    hook: story.hook,
    features: story.features,
    outro: story.outro,
    cta: story.cta,
    images,
    watermark: tier.watermark,
    ...PALETTES[analysis.projectType],
  };
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
    const { publicDir, images } = await stageAssets(jobId, analysis);
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
        imageCount: images.length,
      };
      j.status = "rendering";
    });

    for (const [index, tier] of TIERS.entries()) {
      if (tier.premium && plan !== "pro") continue;

      jobStore.update(jobId, (j) => {
        j.videos[index].status = "rendering";
        j.videos[index].progress = 0;
      });
      const propsFile = path.join(config.workDir, jobId, `props-${tier.id}.json`);
      await fs.writeFile(propsFile, JSON.stringify(buildVideoProps(analysis, tier, images, index)));
      const fileName = outputFileName(tier);

      try {
        await renderWithRemotionCli({
          tier,
          publicDir,
          propsFile,
          outFile: path.join(outDir, fileName),
          signal,
          onProgress: (pct) =>
            jobStore.update(jobId, (j) => {
              j.videos[index].progress = pct;
            }),
        });
      } catch (err) {
        if (err instanceof CancelledError || signal?.aborted) throw new CancelledError();
        const message = (err as Error).message;
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
