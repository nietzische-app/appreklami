import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MediaAsset, MediaOrigin } from "../shared/types";
import { pickImages, toImageAssets } from "./images";
import { captureLiveSite } from "./media/live-capture";
import { findLiveUrl } from "./media/live-url";
import type { ReadmeInfo } from "./readme";
import { fetchReadmeImages } from "./remoteImages";
import type { WalkedFile } from "./walk";

export interface MediaFetchInput {
  root: string;
  files: WalkedFile[];
  readme: ReadmeInfo;
  readmeText: string;
  /** README-referenced image paths relative to the project root. */
  readmeRefs: string[];
  projectName: string;
  packageHomepage?: string;
  /** Disable the Playwright step (tests, or LIVE_CAPTURE=0). */
  liveCapture: boolean;
}

export interface MediaFetchResult {
  media: MediaAsset[];
  origin: MediaOrigin;
  liveUrl?: string;
  notes: string[];
  /** Scratch dir with downloaded/recorded files; the caller must delete it. */
  tempDir?: string;
}

const MAX_MEDIA = 4;

/**
 * Multi-step media search (stops being "empty" at the first step that yields something):
 *  1. Live site: URL from package.json/README -> public product pages only (login/sign-up screens are skipped) ->
 *     product screenshots/demo videos found on them + Playwright smooth-scroll recordings.
 *  2. Repo assets: README hero images (local + GitHub-hosted), OG cards, screenshots, monorepo asset dirs.
 *  3. Nothing found -> origin "generated-ui": the Remotion phone renders a dashboard built from the README features.
 */
export async function fetchMedia(input: MediaFetchInput): Promise<MediaFetchResult> {
  const notes: string[] = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "appreklami-media-"));
  const media: MediaAsset[] = [];
  let origin: MediaOrigin = "generated-ui";

  const liveUrl = findLiveUrl({ readme: input.readmeText, packageHomepage: input.packageHomepage, name: input.projectName });
  notes.push(liveUrl ? `live url candidate: ${liveUrl}` : "no live url found in README/package.json");

  if (liveUrl && input.liveCapture) {
    const live = await captureLiveSite(liveUrl, path.join(tempDir, "live"), notes);
    // Scrolling recordings first (motion), then product shots found on the site, both before anything from the repo.
    for (const asset of [...live.recordings, ...live.showcase]) {
      if (media.length >= MAX_MEDIA) break;
      media.push(asset);
    }
    if (media.length) {
      origin = "live-demo";
      notes.push(`live media: ${live.recordings.length} recording(s), ${live.showcase.length} showcase asset(s)`);
    }
  } else if (liveUrl) {
    notes.push("live capture disabled");
  }

  // Repo assets are always collected: they add scene variety after a recording and are the fallback without one.
  const remote = await fetchReadmeImages(input.readme.remoteImageRefs, path.join(tempDir, "remote"), 3);
  const remoteAssets = await toImageAssets(remote, { minWidth: 400, limit: 3 });
  const localCandidates = pickImages(input.files, input.readmeRefs, 10, media.length ? "A" : "AB");
  const localAssets = await toImageAssets(localCandidates, { minWidth: media.length ? 700 : 500, limit: MAX_MEDIA });
  const repoAssets = [...remoteAssets, ...localAssets];
  notes.push(`repo assets: ${remoteAssets.length} README-hosted, ${localAssets.length} in repo`);

  for (const asset of repoAssets) {
    if (media.length >= MAX_MEDIA) break;
    media.push(asset);
    if (origin === "generated-ui") origin = "repo-assets";
  }

  if (origin === "generated-ui") notes.push("no media found: using generated dashboard UI");
  const keepTemp = media.some((m) => m.src.startsWith(tempDir) || m.poster?.startsWith(tempDir));
  if (!keepTemp) await fs.rm(tempDir, { recursive: true, force: true });

  return { media, origin, liveUrl, notes, tempDir: keepTemp ? tempDir : undefined };
}
