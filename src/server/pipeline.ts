import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzeProject, resolveSource } from "../analyzer";
import { PALETTES } from "../remotion/theme";
import { TIERS, outputFileName } from "../shared/tiers";
import type { Plan, ProjectAnalysis, SourceInput, TierConfig, VideoProps } from "../shared/types";
import { config } from "./config";
import { jobStore } from "./jobStore";
import { renderWithRemotionCli } from "./renderer";

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

export async function runJob(jobId: string, source: SourceInput, plan: Plan): Promise<void> {
  const outDir = path.join(config.rendersDir, jobId);
  await fs.mkdir(outDir, { recursive: true });
  let cleanup: () => Promise<void> = async () => {};

  try {
    jobStore.update(jobId, (j) => {
      j.status = "analyzing";
    });
    const resolved = await resolveSource(source);
    cleanup = resolved.cleanup;
    const analysis = await analyzeProject(resolved.root, resolved.displayName);
    const { publicDir, images } = await stageAssets(jobId, analysis);
    await resolved.cleanup();
    cleanup = async () => {};

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
          onProgress: (pct) =>
            jobStore.update(jobId, (j) => {
              j.videos[index].progress = pct;
            }),
        });
      } catch (err) {
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

    jobStore.update(jobId, (j) => {
      const anyDone = j.videos.some((v) => v.status === "completed");
      j.status = anyDone ? "completed" : "failed";
      if (!anyDone) j.error = "All renders failed.";
    });
  } catch (err) {
    jobStore.update(jobId, (j) => {
      j.status = "failed";
      j.error = (err as Error).message;
    });
  } finally {
    await cleanup();
    await fs.rm(path.join(config.workDir, jobId), { recursive: true, force: true }).catch(() => {});
  }
}

export const newJobId = () => randomUUID();
