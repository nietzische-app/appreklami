import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * README images are often absolute URLs. To avoid SSRF only GitHub-owned hosts are fetched, and
 * every redirect hop is re-validated against the same allowlist.
 */
const ALLOWED_HOSTS = [
  /^github\.com$/,
  /^raw\.githubusercontent\.com$/,
  /^user-images\.githubusercontent\.com$/,
  /^objects\.githubusercontent\.com$/,
  /^github-production-user-asset-[a-z0-9]+\.s3\.amazonaws\.com$/,
];
const SKIP_URL = /(badge|shields\.io|logo|icon|avatar|star-history|contrib|sponsor|\.svg|\.gif)/i;
const TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_BYTES = 8 * 1024;

export const isAllowedImageUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
};

async function download(url: string, dest: string): Promise<string | undefined> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedImageUrl(current)) return undefined;
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return undefined;
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok || !res.body) return undefined;
    const ext = TYPES[(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()];
    if (!ext) return undefined;

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > MAX_BYTES) return undefined;
      chunks.push(chunk);
    }
    if (total < MIN_BYTES) return undefined;
    const file = `${dest}${ext}`;
    await fs.writeFile(file, Buffer.concat(chunks));
    return file;
  }
  return undefined;
}

/** Downloads up to `limit` usable README images into `dir`. Failures are silently skipped. */
export async function fetchReadmeImages(urls: string[], dir: string, limit: number): Promise<string[]> {
  const candidates = [...new Set(urls)].filter((u) => isAllowedImageUrl(u) && !SKIP_URL.test(u)).slice(0, limit * 3);
  if (!candidates.length) return [];
  await fs.mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (const [i, url] of candidates.entries()) {
    if (out.length >= limit) break;
    try {
      const file = await download(url, path.join(dir, `remote-${i + 1}`));
      if (file) out.push(file);
    } catch {
      /* unreachable or too slow: skip */
    }
  }
  return out;
}
