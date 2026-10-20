import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectAnalysis } from "../shared/types";
import { classifyProject } from "./classify";
import { pickImages } from "./images";
import { parseReadme } from "./readme";
import { buildStoryboards } from "./storyboards";
import { walkProject } from "./walk";

const prettifyName = (raw: string) =>
  raw
    .replace(/^@[^/]+\//, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Analyzes a project directory and produces type, assets and 3 marketing storyboards. */
export async function analyzeProject(root: string, fallbackName = path.basename(root)): Promise<ProjectAnalysis> {
  const files = await walkProject(root);

  const readmeFile = files
    .filter((f) => /^readme(\.(md|markdown|txt))?$/i.test(path.posix.basename(f.rel)) && f.rel.split("/").length <= 2)
    .sort((a, b) => a.rel.split("/").length - b.rel.split("/").length)[0];
  const readmeText = readmeFile ? (await fs.readFile(readmeFile.abs, "utf8")).slice(0, 200_000) : "";
  const readme = parseReadme(readmeText);

  const classification = await classifyProject(root, files, readmeText);

  const name = prettifyName(readme.title ?? classification.manifestName ?? fallbackName) || "Your Project";
  const tagline = (readme.tagline ?? classification.manifestDescription ?? `${name} - built to impress.`).slice(0, 160);

  const readmeDir = readmeFile ? path.posix.dirname(readmeFile.rel) : ".";
  const refs = readme.imageRefs.map((r) => path.posix.normalize(path.posix.join(readmeDir, r)));
  const images = pickImages(files, refs);

  return {
    name,
    tagline,
    projectType: classification.type,
    confidence: classification.confidence,
    readmeExcerpt: readme.excerpt,
    images,
    readmeFeatures: readme.features,
    storyboards: buildStoryboards(classification.type, name, tagline, readme.features),
  };
}

export { resolveSource, SourceError } from "./source";
