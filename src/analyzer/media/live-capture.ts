import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import type { MediaAsset } from "../../shared/types";
import { isPublicHost, isSafePublicUrl } from "./url-safety";

/** 9:16 mobile viewport. The webm is stored at this size; the phone mockup scales it to fit. */
export const CAPTURE_VIEWPORT = { width: 540, height: 960 };
export const CAPTURE_SECONDS = 10;
const HARD_TIMEOUT_MS = 75_000;
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

async function findChrome(): Promise<string | undefined> {
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

/**
 * Step 1 of the media pipeline: opens the live product URL in a mobile viewport and records
 * ~10 seconds of smooth page scrolling. Every network request is checked against the SSRF guard.
 * Returns undefined on any failure so the caller can fall back to repo assets.
 */
export async function captureLiveDemo(url: string, outDir: string, notes: string[]): Promise<MediaAsset | undefined> {
  if (!(await isSafePublicUrl(url))) {
    notes.push(`live demo skipped: ${url} is not a safe public URL`);
    return undefined;
  }
  const executablePath = await findChrome();
  if (!executablePath) {
    notes.push("live demo skipped: no Chrome available");
    return undefined;
  }
  await fs.mkdir(outDir, { recursive: true });

  const run = async (): Promise<MediaAsset | undefined> => {
    const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--mute-audio", "--hide-scrollbars"] });
    try {
      const context = await browser.newContext({
        viewport: CAPTURE_VIEWPORT,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        userAgent: MOBILE_UA,
        locale: "en-US",
        recordVideo: { dir: outDir, size: CAPTURE_VIEWPORT },
        acceptDownloads: false,
        serviceWorkers: "block",
      });
      await context.route("**/*", async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith("data:") || reqUrl.startsWith("blob:") || reqUrl.startsWith("about:")) return route.continue();
        try {
          const u = new URL(reqUrl);
          if ((u.protocol === "https:" || u.protocol === "http:") && (await isPublicHost(u.hostname))) return route.continue();
        } catch {
          /* fall through to abort */
        }
        return route.abort("blockedbyclient");
      });

      const page = await context.newPage();
      const t0 = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => {});
      await page.addStyleTag({ content: "html{scroll-behavior:auto!important}" }).catch(() => {});
      await page
        .locator("button, a")
        .filter({ hasText: /^(accept( all)?|i agree|agree|got it|allow all|ok|okay|continue)$/i })
        .first()
        .click({ timeout: 1_200 })
        .catch(() => {});
      await page.waitForTimeout(1_000);

      const posterPath = path.join(outDir, "poster.jpg");
      await page.screenshot({ path: posterPath, type: "jpeg", quality: 85 });
      const startOffsetSec = Math.max(0, (Date.now() - t0) / 1000 - 0.2);

      // Passed as a string: transpiled closures (esbuild/tsx) reference helpers that do not exist in the page.
      await page.evaluate(`new Promise((resolve) => {
        const ms = ${CAPTURE_SECONDS * 1000};
        const max = Math.min(document.documentElement.scrollHeight - window.innerHeight, 7000);
        const start = performance.now();
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        const tick = (now) => {
          const t = Math.min(1, (now - start) / ms);
          window.scrollTo(0, Math.max(0, max) * ease(t));
          if (t < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      })`);

      const video = page.video();
      await context.close();
      const videoPath = video ? await video.path() : undefined;
      if (!videoPath) return undefined;
      const stat = await fs.stat(videoPath);
      if (stat.size < 30 * 1024) {
        notes.push("live demo skipped: recording was empty");
        return undefined;
      }
      const finalPath = path.join(outDir, "live-demo.webm");
      await fs.rename(videoPath, finalPath);
      return {
        kind: "video",
        src: finalPath,
        poster: posterPath,
        width: CAPTURE_VIEWPORT.width,
        height: CAPTURE_VIEWPORT.height,
        startOffsetSec,
        durationSec: CAPTURE_SECONDS,
        origin: "live-demo",
      };
    } finally {
      await browser.close().catch(() => {});
    }
  };

  try {
    return await Promise.race([
      run(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), HARD_TIMEOUT_MS).unref()),
    ]);
  } catch (err) {
    notes.push(`live demo failed: ${(err as Error).message.split("\n")[0]}`);
    return undefined;
  }
}
