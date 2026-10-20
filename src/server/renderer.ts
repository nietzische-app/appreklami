import { spawn } from "node:child_process";
import path from "node:path";
import type { TierConfig } from "../shared/types";
import { config } from "./config";

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
  }
}

/** A failed Remotion run: `message` is safe to show in the UI, `detail` is the captured stderr/stdout tail for logs. */
export class RenderError extends Error {
  constructor(
    message: string,
    readonly kind: "media" | "memory" | "browser" | "timeout" | "props" | "unknown",
    readonly detail: string,
  ) {
    super(message);
  }
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Turns Remotion's raw stderr (stack traces, code frames) into a short message a user can act on. */
export function explainRenderError(output: string, code: number | null): RenderError {
  const text = output.replace(ANSI, "");
  const detail = text.split(/\r?\n/).filter((l) => l.trim()).slice(-40).join("\n");
  const has = (re: RegExp) => re.test(text);

  if (has(/res\.json\(\)|OffthreadVideo|Server returned status|Error while fetching|Failed to fetch|get-audio-channels|compositor|Failed to load image|ffprobe|Invalid data found|moov atom/i)) {
    return new RenderError(
      "A video or image used in the scene could not be loaded by the renderer (the media file is probably broken or unsupported).",
      "media",
      detail,
    );
  }
  if (has(/ENOMEM|out of memory|heap out of memory|Killed|SIGKILL/i) || code === 137) {
    return new RenderError("The renderer ran out of memory. Lower RENDER_CONCURRENCY or give the container more RAM.", "memory", detail);
  }
  if (has(/Timed out|delayRender\(\)/i)) {
    return new RenderError("Rendering timed out while waiting for an asset or frame.", "timeout", detail);
  }
  if (has(/Could not find (Chrome|Chromium|a browser)|Failed to launch the browser|browser process/i)) {
    return new RenderError("The headless browser needed for rendering could not start. Check the server's Chrome installation.", "browser", detail);
  }
  if (has(/Invalid props|ZodError/i)) {
    return new RenderError("The video settings were rejected by the composition.", "props", detail);
  }
  const last = detail.split("\n").slice(-1)[0] ?? "";
  return new RenderError(`Rendering failed (exit code ${code}).${last ? ` ${last.slice(0, 200)}` : ""}`, "unknown", detail);
}

export interface RenderOptions {
  tier: TierConfig;
  /** Remotion --public-dir for this job (sfx + staged images). */
  publicDir: string;
  /** JSON file with the composition props (VideoProps). */
  propsFile: string;
  outFile: string;
  /** Aborting kills the Remotion process tree. */
  signal?: AbortSignal;
  /** 0..100 */
  onProgress: (percent: number) => void;
  /** Overrides for teaser renders; default to the tier's own settings and the full composition. */
  scale?: number;
  crf?: number;
  /** Remotion --frames range, e.g. "0-149". */
  frames?: string;
}

/**
 * Remotion prints `Rendered 12/540` and `Encoded 10/540` lines. Frame rendering is ~70% of the
 * wall time, the concurrent ffmpeg encode ~30%, so we blend them into one bar.
 */
export function createProgressParser(onProgress: (percent: number) => void) {
  let rendered = 0;
  let encoded = 0;
  let total = 0;
  let last = -1;
  return (line: string) => {
    const m = /^\s*(Rendered|Encoded)\s+(\d+)\/(\d+)/.exec(line);
    if (!m) return;
    total = Number(m[3]);
    if (m[1] === "Rendered") rendered = Math.max(rendered, Number(m[2]));
    else encoded = Math.max(encoded, Number(m[2]));
    if (!total) return;
    const pct = Math.min(99, Math.floor(((rendered * 0.7 + encoded * 0.3) / total) * 100));
    if (pct !== last) {
      last = pct;
      onProgress(pct);
    }
  };
}

/** Renders one composition through the Remotion CLI. Resolves when the mp4 is written. */
export function renderWithRemotionCli(opts: RenderOptions): Promise<void> {
  const { tier } = opts;
  const args = [
    "render",
    config.remotionEntry,
    tier.compositionId,
    opts.outFile,
    `--props=${opts.propsFile}`,
    `--public-dir=${opts.publicDir}`,
    `--scale=${opts.scale ?? tier.scale}`,
    "--codec=h264",
    `--crf=${opts.crf ?? tier.crf}`,
    "--log=info",
    "--overwrite",
  ];
  if (opts.frames) args.push(`--frames=${opts.frames}`);
  if (config.renderConcurrency) args.push(`--concurrency=${config.renderConcurrency}`);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(config.remotionBin, args, {
      cwd: path.resolve("."),
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const onAbort = () => {
      killTree();
      reject(new CancelledError());
    };
    if (opts.signal?.aborted) return onAbort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const parse = createProgressParser(opts.onProgress);
    const tail: string[] = [];
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/[\r\n]+/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        parse(line);
        if (line.trim()) {
          tail.push(line);
          if (tail.length > 60) tail.shift();
        }
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const timer = setTimeout(() => {
      killTree();
      reject(new RenderError(`Render timed out after ${Math.round(config.renderTimeoutMs / 1000)}s.`, "timeout", tail.join("\n")));
    }, config.renderTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (code === 0) return resolve();
      if (buffer.trim()) tail.push(buffer);
      reject(explainRenderError(tail.join("\n"), code));
    });
  });
}
