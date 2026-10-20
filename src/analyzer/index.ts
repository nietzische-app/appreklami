import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectAnalysis } from "../shared/types";
import { classifyProject } from "./classify";
import { pickImages } from "./images";
import { parseReadme } from "./readme";
import { fetchReadmeImages } from "./remoteImages";
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
  const tagline = (readme.tagline ?? classification.manifestDescription ?? `${name} - built to impress.`).slice(0, 160);

  const readmeDir = readmeFile ? path.posix.dirname(readmeFile.rel) : ".";
  const refs = readme.imageRefs.map((r) => path.posix.normalize(path.posix.join(readmeDir, r)));
  const MAX_IMAGES = 4;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "appreklami-remote-"));
  const remote = await fetchReadmeImages(readme.remoteImageRefs, tempDir, 3);
  const images = [...remote, ...pickImages(files, refs, MAX_IMAGES)].slice(0, MAX_IMAGES);
  if (!remote.length) await fs.rm(tempDir, { recursive: true, force: true });

  return {
    name,
    tagline,
    projectType: classification.type,
    confidence: classification.confidence,
    readmeExcerpt: readme.excerpt,
    images,
    tempDir: remote.length ? tempDir : undefined,
    readmeFeatures: featureTexts,
    storyboards: buildStoryboards(classification.type, name, tagline, featureTexts),
  };
}

export { resolveSource, SourceError } from "./source";
