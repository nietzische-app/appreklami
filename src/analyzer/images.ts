import path from "node:path";
import type { WalkedFile } from "./walk";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MIN_BYTES = 8 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const GOOD_WORD = "(screenshots?|screens?|preview|demo|banner|hero|cover|gameplay|mockup|showcase|overview)";
const GOOD_BASENAME = new RegExp(`(^|[-_. ])${GOOD_WORD}([-_. 0-9]|$)`, "i");
const GOOD_DIR = /^(screenshots?|previews?|demo|banners?|media|gallery)$/i;
const MAX_UNREFERENCED_DEPTH = 2;
const BAD_NAME = /(icon|favicon|logo|avatar|badge|sprite|tile|thumb|emoji|sponsor|\.min\.|contributor|star-history)/i;
/** Sample data, test fixtures, stock/example photos: images here describe test inputs, not the product. */
const BAD_DIR =
  /(^|\/)(tests?|__tests__|fixtures?|node_modules|\.github|snapshots?|samples?|examples?|testdata|test-data|stock|sample-data|datasets?|data|vendor|third[-_]?party|cypress|e2e|storybook|\.storybook)\//i;

/**
 * Picks images that show the product itself. Only README-referenced images or files whose name says
 * "screenshot/demo/preview/..." qualify; random photos in the repo are ignored (the video then falls
 * back to a branded card instead of showing unrelated pictures).
 */
export function pickImages(files: WalkedFile[], readmeRefs: string[], limit = 4): string[] {
  const refOrder = new Map(readmeRefs.map((r, i) => [path.posix.normalize(r), i]));

  const scored = files
    .filter((f) => IMAGE_EXT.has(path.extname(f.rel).toLowerCase()))
    .filter((f) => f.size >= MIN_BYTES && f.size <= MAX_BYTES)
    .filter((f) => !BAD_DIR.test(f.rel))
    .filter((f) => !BAD_NAME.test(path.posix.basename(f.rel)))
    .map((f) => {
      const referenced = refOrder.has(f.rel);
      const parts = f.rel.split("/");
      const named =
        parts.length - 1 <= MAX_UNREFERENCED_DEPTH &&
        (GOOD_BASENAME.test(path.posix.basename(f.rel, path.extname(f.rel))) || GOOD_DIR.test(parts[parts.length - 2] ?? ""));
      let score = 0;
      if (referenced) score += 10 - Math.min(refOrder.get(f.rel)! * 0.2, 3);
      if (named) score += 4;
      score += Math.min(f.size / (1024 * 1024), 1);
      return { file: f, score, qualifies: referenced || named };
    })
    .filter((s) => s.qualifies)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.file.abs);
}
