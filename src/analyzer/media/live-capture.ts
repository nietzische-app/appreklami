import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import type { MediaAsset } from "../../shared/types";
import { IMAGE_TYPES, VIDEO_TYPES, downloadPublic } from "./safe-download";
import { parseImageSize } from "./image-size";
import {
  PROBE_SCRIPT,
  candidateUrls,
  isAuthUrl,
  isLoginPage,
  isThinPage,
  imageStatsScript,
  looksDecorative,
  scoreShowcaseImage,
  smoothScrollScript,
  type PageImage,
  type ImageStats,
  type PageProbe,
} from "./page-guard";
import { isPublicHost, isSafePublicUrl } from "./url-safety";

/** 9:16 mobile viewport. Recordings are stored at this size; the phone mockup scales them to fit. */
export const CAPTURE_VIEWPORT = { width: 540, height: 960 };
const PROBE_VIEWPORT = { width: 1280, height: 800 };
export const CAPTURE_SECONDS = 10;
const MAX_PROBED_PAGES = 6;
const MAX_APPROVED_PAGES = 3;
const MAX_RECORDED_PAGES = 2;
const HARD_TIMEOUT_MS = 120_000;
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

export interface LiveCaptureResult {
  /** Scrolling recordings of public product pages (never login screens). */
  recordings: MediaAsset[];
  /** Product screenshots / demo videos found on those pages, best first. */
  showcase: MediaAsset[];
}

export interface CaptureDeps {
  isSafeUrl: (url: string) => Promise<boolean>;
  isPublic: (hostname: string) => Promise<boolean>;
  executablePath?: string;
}

const defaultDeps: CaptureDeps = { isSafeUrl: isSafePublicUrl, isPublic: isPublicHost };

export async function findChrome(): Promise<string | undefined> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.resolve("node_modules/.remotion/chrome-headless-shell");
  const find = async () => {
    for (const platform of await fs.readdir(base).catch(() => [])) {
      const dir = path.join(base, platform);
      for (const inner of await fs.readdir(dir).catch(() => [])) {
        const exe = path.join(dir, inner, "chrome-headless-shell");
        if (await fs.stat(exe).then(() => true, () => false)) return exe;
      }
    }
    return undefined;
  };
  const found = await find();
  if (found) return found;
  try {
    const { ensureBrowser } = await import("@remotion/renderer");
    await ensureBrowser();
    return await find();
  } catch {
    return undefined;
  }
}

async function newGuardedContext(browser: Browser, deps: CaptureDeps, options: Parameters<Browser["newContext"]>[0]): Promise<BrowserContext> {
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", locale: "en-US", ...options });
  await context.route("**/*", async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.startsWith("data:") || reqUrl.startsWith("blob:") || reqUrl.startsWith("about:")) return route.continue();
    try {
      const u = new URL(reqUrl);
      if ((u.protocol === "https:" || u.protocol === "http:") && (await deps.isPublic(u.hostname))) return route.continue();
    } catch {
      /* fall through to abort */
    }
    return route.abort("blockedbyclient");
  });
  return context;
}

type Page = Awaited<ReturnType<BrowserContext["newPage"]>>;

/** Navigates and reports why a page is unusable (auth redirect, login form) or undefined when it can be filmed. */
async function openPublicPage(page: Page, url: string, deps: CaptureDeps): Promise<{ finalUrl: string; probe?: PageProbe; reject?: string }> {
  if (!(await deps.isSafeUrl(url))) return { finalUrl: url, reject: "not a safe public URL" };
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForLoadState("load", { timeout: 6_000 }).catch(() => {});
  const finalUrl = page.url();
  if (response && response.status() >= 400) return { finalUrl, reject: `HTTP ${response.status()}` };
  if (isAuthUrl(finalUrl)) return { finalUrl, reject: "redirected to a login/sign-up page" };
  await page.waitForTimeout(700);
  const probe = (await page.evaluate(PROBE_SCRIPT)) as PageProbe;
  if (isLoginPage(probe)) return { finalUrl, probe, reject: "login form detected" };
  return { finalUrl, probe };
}

/** Dismisses cookie banners only (scoped to consent containers); never touches login/app buttons. */
async function dismissCookieBanner(page: Page): Promise<void> {
  await page
    .locator('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [aria-label*="cookie" i]')
    .locator("button")
    .filter({ hasText: /^(accept( all)?( cookies)?|i agree|agree|got it|allow all)$/i })
    .first()
    .click({ timeout: 1_000 })
    .catch(() => {});
}

interface Harvest {
  images: PageImage[];
  videos: { src: string; poster?: string }[];
}

/** Scrolls quickly to trigger lazy loading, then lists the large images and demo videos on the page. */
async function harvestPage(page: Page): Promise<Harvest> {
  await page.evaluate(`new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      window.scrollTo(0, i * window.innerHeight * 0.9);
      if (++i > 10 || i * window.innerHeight * 0.9 > document.documentElement.scrollHeight) { window.scrollTo(0, 0); return setTimeout(resolve, 400); }
      setTimeout(tick, 120);
    };
    tick();
  })`);
  const raw = (await page.evaluate(`(() => {
    const images = [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.alt || '', width: i.naturalWidth, height: i.naturalHeight }));
    const videos = [...document.querySelectorAll('video')].map((v) => ({
      src: v.currentSrc || v.src || (v.querySelector('source') && v.querySelector('source').src) || '',
      poster: v.poster || '',
    }));
    return { images, videos };
  })()`)) as Harvest;
  return { images: raw.images, videos: raw.videos.filter((v) => /\.(mp4|webm)(\?|#|$)/i.test(v.src)) };
}

async function recordPage(browser: Browser, url: string, outDir: string, name: string, seconds: number, deps: CaptureDeps, notes: string[]): Promise<MediaAsset | undefined> {
  const dir = path.join(outDir, name);
  await fs.mkdir(dir, { recursive: true });
  const context = await newGuardedContext(browser, deps, {
    viewport: CAPTURE_VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
    recordVideo: { dir, size: CAPTURE_VIEWPORT },
  });
  try {
    const page = await context.newPage();
    const t0 = Date.now();
    const opened = await openPublicPage(page, url, deps);
    if (opened.reject) {
      notes.push(`recording of ${url} dropped: ${opened.reject}`);
      return undefined;
    }
    await dismissCookieBanner(page);
    await page.waitForTimeout(600);

    const posterPath = path.join(dir, "poster.jpg");
    await page.screenshot({ path: posterPath, type: "jpeg", quality: 85 });
    const startOffsetSec = Math.max(0, (Date.now() - t0) / 1000 - 0.2);
    await page.evaluate(smoothScrollScript(seconds * 1000));

    const video = page.video();
    await context.close();
    const videoPath = video ? await video.path() : undefined;
    if (!videoPath) return undefined;
    const stat = await fs.stat(videoPath);
    if (stat.size < 30 * 1024) {
      notes.push(`recording of ${url} dropped: empty`);
      return undefined;
    }
    const finalPath = path.join(dir, "recording.webm");
    await fs.rename(videoPath, finalPath);
    return {
      kind: "video",
      src: finalPath,
      poster: posterPath,
      width: CAPTURE_VIEWPORT.width,
      height: CAPTURE_VIEWPORT.height,
      startOffsetSec,
      durationSec: seconds,
      origin: "live-demo",
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Step 1 of the media pipeline. Looks for public pages that show the product (home, features, product, solutions,
 * docs), skips anything that is or redirects to a login/sign-up screen, harvests product screenshots and demo videos
 * from the good pages and records a smooth scroll of up to two of them. Every request goes through the SSRF guard.
 * Returns empty lists when nothing usable was found (callers then fall back to repo assets / generated UI).
 */
export async function captureLiveSite(url: string, outDir: string, notes: string[], deps: CaptureDeps = defaultDeps): Promise<LiveCaptureResult> {
  const empty: LiveCaptureResult = { recordings: [], showcase: [] };
  if (!(await deps.isSafeUrl(url))) {
    notes.push(`live demo skipped: ${url} is not a safe public URL`);
    return empty;
  }
  const executablePath = deps.executablePath ?? (await findChrome());
  if (!executablePath) {
    notes.push("live demo skipped: no Chrome available");
    return empty;
  }
  await fs.mkdir(outDir, { recursive: true });

  const run = async (): Promise<LiveCaptureResult> => {
    const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--mute-audio", "--hide-scrollbars"] });
    try {
      const probeContext = await newGuardedContext(browser, deps, { viewport: PROBE_VIEWPORT, deviceScaleFactor: 1 });
      const approved: { url: string }[] = [];
      const thin: { url: string }[] = [];
      const images = new Map<string, PageImage>();
      const videos: { src: string }[] = [];

      for (const candidate of candidateUrls(url, MAX_PROBED_PAGES)) {
        if (approved.length >= MAX_APPROVED_PAGES) break;
        const page = await probeContext.newPage();
        try {
          const opened = await openPublicPage(page, candidate, deps);
          if (opened.reject) {
            notes.push(`skipped ${candidate}: ${opened.reject}`);
            continue;
          }
          if (approved.some((a) => a.url === opened.finalUrl) || thin.some((a) => a.url === opened.finalUrl)) continue;
          if (opened.probe && isThinPage(opened.probe)) {
            thin.push({ url: opened.finalUrl });
            notes.push(`thin page, only used as a last resort: ${opened.finalUrl}`);
            continue;
          }
          approved.push({ url: opened.finalUrl });
          notes.push(`public page ok: ${opened.finalUrl}`);
          const found = await harvestPage(page);
          for (const img of found.images) if (img.src && /^https?:/i.test(img.src) && !images.has(img.src)) images.set(img.src, img);
          for (const v of found.videos) videos.push({ src: v.src });
        } catch (err) {
          notes.push(`skipped ${candidate}: ${(err as Error).message.split("\n")[0]}`);
        } finally {
          await page.close().catch(() => {});
        }
      }

      if (!approved.length && thin.length) approved.push(thin[0]);
      if (!approved.length) {
        await probeContext.close().catch(() => {});
        notes.push("every candidate page needs a login or is empty: no live media");
        return empty;
      }
      const statsPage = await probeContext.newPage();

      const showcase: MediaAsset[] = [];
      const ranked = [...images.values()]
        .map((img) => ({ img, score: scoreShowcaseImage(img) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      for (const [i, { img }] of ranked.entries()) {
        if (showcase.length >= 3) break;
        const file = await downloadPublic(img.src, path.join(outDir, `showcase-${i + 1}`), { maxBytes: 8_000_000, types: IMAGE_TYPES, isSafe: deps.isSafeUrl });
        if (!file) continue;
        const bytes = await fs.readFile(file);
        const size = parseImageSize(bytes);
        if (!size || size.width < 700 || size.height < 350) continue;
        const mime = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".gif") ? "image/gif" : "image/jpeg";
        const stats = (await statsPage.evaluate(imageStatsScript(`data:${mime};base64,${bytes.toString("base64")}`)).catch(() => null)) as ImageStats | null;
        if (looksDecorative(stats)) {
          notes.push(`ignored decorative image ${new URL(img.src).pathname}`);
          continue;
        }
        showcase.push({ kind: "image", src: file, width: size.width, height: size.height, origin: "live-demo" });
      }
      for (const [i, v] of videos.slice(0, 2).entries()) {
        const file = await downloadPublic(v.src, path.join(outDir, `demo-video-${i + 1}`), { maxBytes: 20_000_000, minBytes: 20_000, types: VIDEO_TYPES, isSafe: deps.isSafeUrl });
        if (file) {
          showcase.unshift({ kind: "video", src: file, width: CAPTURE_VIEWPORT.width, height: CAPTURE_VIEWPORT.height, origin: "live-demo" });
          break;
        }
      }
      await probeContext.close().catch(() => {});
      notes.push(`site showcase: ${showcase.length} product image(s)/video(s) from ${ranked.length} candidate(s)`);

      const recordings: MediaAsset[] = [];
      const targets = approved.slice(0, MAX_RECORDED_PAGES);
      const seconds = targets.length > 1 ? 9 : CAPTURE_SECONDS;
      for (const [i, target] of targets.entries()) {
        const recording = await recordPage(browser, target.url, outDir, `rec-${i + 1}`, seconds, deps, notes).catch((err) => {
          notes.push(`recording of ${target.url} failed: ${(err as Error).message.split("\n")[0]}`);
          return undefined;
        });
        if (recording) recordings.push(recording);
      }
      return { recordings, showcase };
    } finally {
      await browser.close().catch(() => {});
    }
  };

  try {
    return await Promise.race([run(), new Promise<LiveCaptureResult>((resolve) => setTimeout(() => resolve(empty), HARD_TIMEOUT_MS).unref())]);
  } catch (err) {
    notes.push(`live demo failed: ${(err as Error).message.split("\n")[0]}`);
    return empty;
  }
}
