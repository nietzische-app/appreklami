import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { RenderInternals } from "@remotion/renderer";
import type { MediaAsset } from "../shared/types";

const run = promisify(execFile);

const binary = (type: "ffmpeg" | "ffprobe") =>
  RenderInternals.getExecutablePath({ type, indent: false, logLevel: "error", binariesDirectory: null });

/** True when the file has a decodable video stream with a positive size. */
export async function probeVideo(file: string): Promise<{ width: number; height: number; durationSec: number } | undefined> {
  try {
    const { stdout } = await run(
      binary("ffprobe"),
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file],
      { timeout: 15_000 },
    );
    const data = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
    const stream = data.streams?.[0];
    if (!stream?.width || !stream.height) return undefined;
    return { width: stream.width, height: stream.height, durationSec: Number(data.format?.duration) || 0 };
  } catch {
    return undefined;
  }
}

/**
 * Re-encodes a screen recording to a seekable H.264 mp4. Playwright's webm has no seek index, which makes
 * Remotion's OffthreadVideo (random access per frame) fail. Returns the new file, or undefined if it is unusable.
 */
async function toSeekableMp4(src: string, dest: string): Promise<{ width: number; height: number; durationSec: number } | undefined> {
  if (!(await probeVideo(src))) return undefined;
  try {
    await run(
      binary("ffmpeg"),
      [
        "-y",
        "-v",
        "error",
        "-i",
        src,
        "-an",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "30",
        "-movflags",
        "+faststart",
        dest,
      ],
      { timeout: 90_000 },
    );
  } catch {
    return undefined;
  }
  return probeVideo(dest);
}

/**
 * Turns a rendered low-resolution teaser into a preview that cannot be un-blurred: the picture is squeezed to a
 * ~27x48 thumbnail and scaled back up, audio is dropped. Returns false (and writes nothing usable) on any ffmpeg error.
 */
export async function blurPreview(src: string, dest: string, width: number, height: number): Promise<boolean> {
  try {
    await run(
      binary("ffmpeg"),
      [
        "-y",
        "-v",
        "error",
        "-i",
        src,
        "-an",
        "-vf",
        `scale=${Math.round(width / 10)}:${Math.round(height / 10)}:flags=area,scale=${width}:${height}:flags=bicubic`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        dest,
      ],
      { timeout: 60_000 },
    );
  } catch {
    await fs.rm(dest, { force: true }).catch(() => {});
    return false;
  }
  return !!(await probeVideo(dest));
}

/**
 * Makes one staged media item safe to hand to Remotion. Videos are validated and normalised to mp4;
 * a broken video degrades to its poster screenshot, or to nothing (the composition then shows generated UI).
 * `publicDir` is the Remotion public dir, `media.src` is relative to it.
 */
export async function prepareMedia(publicDir: string, media: MediaAsset, notes: string[]): Promise<MediaAsset | undefined> {
  const abs = path.join(publicDir, media.src);
  if (!(await fs.stat(abs).then((s) => s.isFile() && s.size > 0, () => false))) {
    notes.push(`media dropped: ${media.src} is missing or empty`);
    return undefined;
  }
  if (media.kind !== "video") return media;

  const mp4Rel = media.src.replace(/\.[^.]+$/, "") + ".norm.mp4";
  const info = await toSeekableMp4(abs, path.join(publicDir, mp4Rel));
  if (info) {
    await fs.rm(abs, { force: true });
    const durationSec = info.durationSec > 0 ? Math.min(media.durationSec ?? info.durationSec, info.durationSec) : media.durationSec;
    return { ...media, src: mp4Rel, width: info.width, height: info.height, durationSec };
  }

  notes.push(`video ${media.src} is not playable, using ${media.poster ? "its screenshot" : "generated UI"} instead`);
  return media.poster ? stillFromPoster(media) : undefined;
}

/** Replaces a video asset by its poster screenshot (same dimensions, shown as an image). */
export function stillFromPoster(media: MediaAsset): MediaAsset | undefined {
  if (!media.poster) return undefined;
  return { kind: "image", src: media.poster, width: media.width, height: media.height, origin: media.origin };
}

/** Render retry ladder: 0 = as is, 1 = videos become screenshots, 2 = no media (generated UI). */
export function degradeMedia(media: MediaAsset[], level: 0 | 1 | 2): MediaAsset[] {
  if (level === 0) return media;
  if (level === 2) return [];
  return media.flatMap((m) => {
    if (m.kind !== "video") return [m];
    const still = stillFromPoster(m);
    return still ? [still] : [];
  });
}
