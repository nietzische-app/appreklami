import path from "node:path";
import type { MediaAsset } from "../shared/types";
import { readImageSize } from "./media/image-size";
import type { WalkedFile } from "./walk";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MIN_BYTES = 8 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;

const GOOD_WORD = "(screenshots?|screens?|preview|demo|banner|hero|cover|gameplay|mockup|showcase|overview)";
const GOOD_BASENAME = new RegExp(`(^|[-_. ])${GOOD_WORD}([-_. 0-9]|$)`, "i");
const GOOD_DIR = /^(screenshots?|previews?|demo|banners?|media|gallery)$/i;
/** OpenGraph / social cards are made for exactly this purpose: representing the product. */
const OG_NAME = /^(og|opengraph|open-graph|social|twitter)([-_.]?(image|preview|card|banner))?\d*$/i;
const BAD_NAME = /(icon|favicon|logo|avatar|badge|sprite|tile|thumb|emoji|sponsor|\.min\.|contributor|star-history|apple-touch|android-chrome|placeholder|profile)/i;
/** Sample data, test fixtures, stock/example photos: images here describe test inputs, not the product. */
const BAD_DIR =
  /(^|\/)(tests?|__tests__|fixtures?|node_modules|snapshots?|samples?|examples?|testdata|test-data|stock|sample-data|datasets?|vendor|third[-_]?party|cypress|e2e|storybook|\.storybook|integrations?|app-store|icons?|avatars?|flags?|emojis?)\//i;
/** Typical homes of marketing assets in apps and monorepos. */
const ASSET_DIR =
  /(^|\/)((apps|packages|projects|examples)\/[^/]+\/(public|assets|static|images|docs)|docs\/(images|assets|img|screenshots?)|\.github\/(assets|images)|assets|public|static|images|img|screenshots?|media|art|design)\//i;
const MAX_UNREFERENCED_DEPTH = 5;

interface Candidate {
  file: WalkedFile;
  score: number;
  tier: "A" | "B";
}

/**
 * Step 2 of the media pipeline. Tier A = README hero/showcase images, OG/social cards and
 * "screenshot/demo/preview"-named files. Tier B = other large images in asset folders, only
 * used when tier A is empty. Returns candidates; dimensions are verified afterwards.
 */
export function pickImages(files: WalkedFile[], readmeRefs: string[], limit = 4, tiers: "A" | "AB" = "A"): string[] {
  const refOrder = new Map(readmeRefs.map((r, i) => [path.posix.normalize(r), i]));

  const candidates: Candidate[] = files
    .filter((f) => IMAGE_EXT.has(path.extname(f.rel).toLowerCase()))
    .filter((f) => f.size >= MIN_BYTES && f.size <= MAX_BYTES)
    .filter((f) => !BAD_DIR.test(f.rel))
    .filter((f) => !BAD_NAME.test(path.posix.basename(f.rel)))
    .map((f): Candidate | undefined => {
      const parts = f.rel.split("/");
      const base = path.posix.basename(f.rel, path.extname(f.rel));
      const referenced = refOrder.has(f.rel);
      const og = OG_NAME.test(base);
      const shallow = parts.length - 1 <= MAX_UNREFERENCED_DEPTH;
      const named = shallow && (GOOD_BASENAME.test(base) || GOOD_DIR.test(parts[parts.length - 2] ?? ""));
      let score = Math.min(f.size / (1024 * 1024), 1);
      if (referenced) score += 10 - Math.min(refOrder.get(f.rel)! * 0.2, 3);
      if (og) score += 8;
      if (named) score += 4;
      if (referenced || og || named) return { file: f, score, tier: "A" };
      if (tiers === "AB" && ASSET_DIR.test(f.rel) && shallow && f.size > 60 * 1024) return { file: f, score, tier: "B" };
      return undefined;
    })
    .filter((c): c is Candidate => !!c);

  const hasA = candidates.some((c) => c.tier === "A");
  return candidates
    .filter((c) => (hasA ? c.tier === "A" : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.file.abs);
}

/** Candidate paths -> verified MediaAssets (readable header, big enough, sane aspect ratio). */
export async function toImageAssets(paths: string[], opts: { minWidth: number; limit: number }): Promise<MediaAsset[]> {
  const out: MediaAsset[] = [];
  for (const p of paths) {
    if (out.length >= opts.limit) break;
    const size = await readImageSize(p).catch(() => undefined);
    if (!size || size.width < opts.minWidth || size.height < 200) continue;
    const ratio = size.width / size.height;
    if (ratio > 4 || ratio < 0.2) continue;
    out.push({ kind: "image", src: p, width: size.width, height: size.height, origin: "repo-asset" });
  }
  return out;
}
