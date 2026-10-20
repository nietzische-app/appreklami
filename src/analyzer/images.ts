import path from "node:path";
import type { WalkedFile } from "./walk";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MIN_BYTES = 8 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const GOOD_NAME = /(screenshot|screen|preview|demo|banner|hero|cover|gameplay|ui|mockup|showcase)/i;
const BAD_NAME = /(icon|favicon|logo|avatar|badge|sprite|tile|thumb|emoji|sponsor|\.min\.)/i;
const BAD_DIR = /(^|\/)(test|tests|__tests__|fixtures|node_modules|\.github|docs\/api|snapshots?)\//i;

/** Ranks repo images: README-referenced + "screenshot"-like names first. */
export function pickImages(files: WalkedFile[], readmeRefs: string[], limit = 4): string[] {
  const refSet = new Set(readmeRefs.map((r) => path.posix.normalize(r)));

  const scored = files
    .filter((f) => IMAGE_EXT.has(path.extname(f.rel).toLowerCase()))
    .filter((f) => f.size >= MIN_BYTES && f.size <= MAX_BYTES)
    .filter((f) => !BAD_DIR.test(f.rel))
    .map((f) => {
      const base = path.posix.basename(f.rel);
      let score = 0;
      if (refSet.has(f.rel)) score += 10;
      if (GOOD_NAME.test(f.rel)) score += 4;
      if (BAD_NAME.test(base)) score -= 6;
      if (/^(assets|docs|images?|screenshots?|media|public)\//i.test(f.rel)) score += 1;
      score += Math.min(f.size / (512 * 1024), 2);
      return { file: f, score };
    })
    .filter((s) => s.score > -2)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.file.abs);
}
