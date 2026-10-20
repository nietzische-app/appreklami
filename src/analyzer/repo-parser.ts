import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectAnalysis, UserIntent } from "../shared/types";
import { classifyProject } from "./classify";
import { readmeForPrompt, writeStoryboards } from "./copywriter";
import { applyIntent } from "./intent";
import { fetchMedia } from "./media-fetcher";
import { parseReadme } from "./readme";
import { buildStoryboards } from "./storyboards";
import { walkProject } from "./walk";

const DOMAIN_LIKE = /^[a-z0-9-]+\.(com|io|app|dev|ai|co|net|org|so|sh|xyz)$/i;

const prettifyName = (raw: string) =>
  DOMAIN_LIKE.test(raw.trim())
    ? raw.trim().replace(/^./, (c) => c.toUpperCase())
    : raw
    .replace(/^@[^/]+\//, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Analyzes a project directory and produces type, assets and 3 marketing storyboards. */
export async function analyzeProject(
  root: string,
  fallbackName = path.basename(root),
  /** GitHub repo names are brand names ("cal.com"); package.json names are often internal ("calcom-monorepo"). */
  preferFallbackName = false,
  options: { liveCapture?: boolean; aiCopy?: boolean; intent?: UserIntent } = {},
): Promise<ProjectAnalysis> {
  const files = await walkProject(root);

  const readmeFile = files
    .filter((f) => /^readme(\.(md|markdown|txt))?$/i.test(path.posix.basename(f.rel)) && f.rel.split("/").length <= 2)
    .sort((a, b) => a.rel.split("/").length - b.rel.split("/").length)[0];
  const readmeText = readmeFile ? (await fs.readFile(readmeFile.abs, "utf8")).slice(0, 200_000) : "";
  const readme = parseReadme(readmeText);

  const classification = await classifyProject(root, files, readmeText);

  const name = prettifyName(readme.title ?? (preferFallbackName ? fallbackName : (classification.manifestName ?? fallbackName))) || "Your Project";
  const featureTexts = readme.features.length
    ? readme.features
    : readme.sections.length >= 3
      ? readme.sections.map((s) => `${s.title} - ${s.summary}`)
      : [];
  const intent = options.intent;
  const tagline = (intent?.projectDescription ?? readme.tagline ?? classification.manifestDescription ?? `${name} - built to impress.`).slice(0, 160);

  const readmeDir = readmeFile ? path.posix.dirname(readmeFile.rel) : ".";
  const refs = readme.imageRefs.map((r) => path.posix.normalize(path.posix.join(readmeDir, r)));
  const mediaResult = await fetchMedia({
    root,
    files,
    readme,
    readmeText,
    readmeRefs: refs,
    projectName: name,
    packageHomepage: classification.manifestHomepage,
    liveCapture: options.liveCapture ?? process.env.LIVE_CAPTURE !== "0",
    keyFeature: intent?.keyFeature,
  });

  let storyboards = applyIntent(buildStoryboards(classification.type, name, tagline, featureTexts), intent, name);
  let copySource: "ai" | "template" = "template";
  if (options.aiCopy !== false) {
    const written = await writeStoryboards(
      { name, tagline, projectType: classification.type, readme: readmeForPrompt(readmeText), features: featureTexts, liveUrl: mediaResult.liveUrl, intent },
      mediaResult.notes,
    );
    if (written) {
      storyboards = written;
      copySource = "ai";
    }
  }

  return {
    name,
    tagline,
    projectType: classification.type,
    confidence: classification.confidence,
    readmeExcerpt: readme.excerpt,
    media: mediaResult.media,
    mediaOrigin: mediaResult.origin,
    liveUrl: mediaResult.liveUrl,
    mediaNotes: mediaResult.notes,
    tempDir: mediaResult.tempDir,
    readmeFeatures: featureTexts,
    storyboards,
    copySource,
  };
}

