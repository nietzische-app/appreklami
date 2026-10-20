/**
 * Renders each composition (small scale, default props) and measures where every sound effect actually lands in the
 * mixed audio by cross-correlating the source WAV with the rendered track. Prints the error in milliseconds.
 * Run: npm run verify:audio
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RenderInternals } from "@remotion/renderer";
import { SFX } from "../src/remotion/sfx-manifest";
import { defaultProps } from "../src/remotion/props";
import { sfxEvents, type SfxEvent } from "../src/remotion/sync";
import { FPS } from "../src/shared/video";

const SR = 48000;
const tmp = mkdtempSync(path.join(os.tmpdir(), "audio-sync-"));
cpSync("assets/sfx", path.join(tmp, "public/sfx"), { recursive: true });
cpSync("assets/fonts", path.join(tmp, "public/fonts"), { recursive: true });
const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });

const readWav = (file: string): Float32Array => {
  const b = readFileSync(file);
  const out = new Float32Array((b.length - 44) / 2);
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  return out;
};

const words = defaultProps.hook.split(/\s+/).filter(Boolean).length;
const plan: [string, SfxEvent[]][] = [
  ["promo-basic", sfxEvents(defaultProps.theme, "basic", words, defaultProps.features.length)],
  ["promo-dynamic", sfxEvents(defaultProps.theme, "dynamic", words, defaultProps.features.length)],
  ["promo-pro", sfxEvents(defaultProps.theme, "pro", words, defaultProps.features.length)],
];

let worst = 0;
for (const [id, events] of plan) {
  const mp4 = path.join(tmp, `${id}.mp4`);
  const wav = path.join(tmp, `${id}.wav`);
  execFileSync("npx", ["remotion", "render", "src/remotion/index.ts", id, mp4, `--public-dir=${path.join(tmp, "public")}`, "--scale=0.25", "--log=error"], { stdio: "inherit" });
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", String(SR), "-c:a", "pcm_s16le", wav]);
  const mix = readWav(wav);
  console.log(`\n${id}`);
  for (const e of events) {
    const meta = SFX[e.name];
    const start = e.hit - meta.hitFrames;
    if (start < 0) {
      console.log(`  ${e.name.padEnd(15)} hit f${e.hit}: starts before frame 0 (trimmed), skipped`);
      continue;
    }
    const ref = readWav(path.join("assets/sfx", `${e.name}.wav`)).subarray(0, Math.round(SR * 0.12));
    const nominal = Math.round((start / FPS) * SR);
    const range = Math.round(SR * 0.06);
    let best = -Infinity;
    let bestLag = 0;
    for (let lag = -range; lag <= range; lag += 1) {
      const base = nominal + lag;
      if (base < 0 || base + ref.length > mix.length) continue;
      let dot = 0;
      for (let i = 0; i < ref.length; i += 2) dot += ref[i] * mix[base + i];
      if (dot > best) {
        best = dot;
        bestLag = lag;
      }
    }
    const ms = (bestLag / SR) * 1000;
    worst = Math.max(worst, Math.abs(ms));
    console.log(`  ${e.name.padEnd(15)} hit f${String(e.hit).padStart(3)} (${((e.hit / FPS) * 1000).toFixed(0).padStart(5)} ms): landed ${ms >= 0 ? "+" : ""}${ms.toFixed(2)} ms from target (${((ms * FPS) / 1000).toFixed(2)} frames)`);
  }
}
console.log(`\nworst error: ${worst.toFixed(2)} ms (${((worst * FPS) / 1000).toFixed(2)} frames)`);
process.exit(worst > 1000 / FPS / 2 ? 1 : 0);
