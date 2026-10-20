import { promises as fs } from "node:fs";
import { isSafePublicUrl } from "./url-safety";

export interface DownloadOptions {
  maxBytes: number;
  minBytes?: number;
  /** content-type -> file extension. Anything else is rejected. */
  types: Record<string, string>;
  /** Injectable for tests; defaults to the SSRF guard. */
  isSafe?: (url: string) => Promise<boolean>;
}

export const IMAGE_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };
export const VIDEO_TYPES = { "video/mp4": ".mp4", "video/webm": ".webm" };

/**
 * Downloads a public asset with every redirect hop checked against the SSRF guard, a content-type allowlist and a hard
 * size cap. Returns the written file path or undefined; never throws.
 */
export async function downloadPublic(url: string, destBase: string, opts: DownloadOptions): Promise<string | undefined> {
  const isSafe = opts.isSafe ?? isSafePublicUrl;
  try {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!(await isSafe(current))) return undefined;
      const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return undefined;
        current = new URL(next, current).toString();
        continue;
      }
      if (!res.ok || !res.body) return undefined;
      const ext = opts.types[(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()];
      if (!ext) return undefined;
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > opts.maxBytes) return undefined;

      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > opts.maxBytes) return undefined;
        chunks.push(chunk);
      }
      if (total < (opts.minBytes ?? 2_000)) return undefined;
      const file = `${destBase}${ext}`;
      await fs.writeFile(file, Buffer.concat(chunks));
      return file;
    }
  } catch {
    /* unreachable, slow or oversized: skip */
  }
  return undefined;
}
