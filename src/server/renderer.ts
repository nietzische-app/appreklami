import { spawn } from "node:child_process";
import path from "node:path";
import type { TierConfig } from "../shared/types";
import { config } from "./config";

export interface RenderOptions {
  tier: TierConfig;
  /** Remotion --public-dir for this job (sfx + staged images). */
  publicDir: string;
  /** JSON file with the composition props (VideoProps). */
  propsFile: string;
  outFile: string;
  /** 0..100 */
  onProgress: (percent: number) => void;
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
    `--scale=${tier.scale}`,
    "--codec=h264",
    `--crf=${tier.crf}`,
    "--log=info",
    "--overwrite",
  ];
  if (config.renderConcurrency) args.push(`--concurrency=${config.renderConcurrency}`);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(config.remotionBin, args, {
      cwd: path.resolve("."),
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

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
          if (tail.length > 30) tail.shift();
        }
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Render timed out after ${Math.round(config.renderTimeoutMs / 1000)}s`));
    }, config.renderTimeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`remotion exited with code ${code}: ${tail.slice(-6).join(" | ")}`));
    });
  });
}
