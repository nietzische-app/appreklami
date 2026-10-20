/**
 * Generates every sound effect used by the Remotion compositions as 16-bit mono WAV
 * (no external audio assets / licences required). Run: npm run sfx
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SAMPLE_RATE = 44100;
type Wave = "square" | "sine" | "triangle" | "noise";

const outDir = path.resolve("assets/sfx");
mkdirSync(outDir, { recursive: true });

let seed = 1337;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
};

interface Note {
  /** Start frequency in Hz. */
  freq: number;
  /** Optional end frequency (linear sweep). */
  freqEnd?: number;
  duration: number;
  wave: Wave;
  volume?: number;
  /** Seconds from the start of the sound. */
  start?: number;
  /** 8-bit crush: number of quantisation levels (e.g. 16). */
  crush?: number;
  attack?: number;
}

function render(notes: Note[], tail = 0.05): Float32Array {
  const total = Math.max(...notes.map((n) => (n.start ?? 0) + n.duration)) + tail;
  const out = new Float32Array(Math.ceil(total * SAMPLE_RATE));
  for (const n of notes) {
    const start = Math.floor((n.start ?? 0) * SAMPLE_RATE);
    const len = Math.floor(n.duration * SAMPLE_RATE);
    const attack = Math.max(1, Math.floor((n.attack ?? 0.004) * SAMPLE_RATE));
    let phase = 0;
    let lowpass = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const f = n.freqEnd ? n.freq + (n.freqEnd - n.freq) * t : n.freq;
      phase += f / SAMPLE_RATE;
      const p = phase % 1;
      let v: number;
      switch (n.wave) {
        case "square":
          v = p < 0.5 ? 1 : -1;
          break;
        case "sine":
          v = Math.sin(2 * Math.PI * p);
          break;
        case "triangle":
          v = 4 * Math.abs(p - 0.5) - 1;
          break;
        default:
          lowpass += 0.35 * ((rand() * 2 - 1) - lowpass);
          v = lowpass * 2.2;
      }
      if (n.crush) v = Math.round(v * n.crush) / n.crush;
      const env = Math.min(1, i / attack) * Math.pow(1 - t, 1.6);
      out[start + i] += v * env * (n.volume ?? 0.5);
    }
  }
  return out;
}

function writeWav(name: string, samples: Float32Array): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path.join(outDir, name), Buffer.concat([header, data]));
  console.log(`wrote ${name} (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
}

// Basic (standard, soft)
writeWav("soft-chime.wav", render([
  { freq: 880, duration: 0.5, wave: "sine", volume: 0.35 },
  { freq: 1318.5, duration: 0.6, wave: "sine", volume: 0.25, start: 0.08 },
]));
writeWav("soft-whoosh.wav", render([{ freq: 0, duration: 0.45, wave: "noise", volume: 0.3, attack: 0.15 }]));

// Dynamic (8-bit / arcade)
writeWav("arcade-blip.wav", render([{ freq: 660, duration: 0.07, wave: "square", volume: 0.3, crush: 8 }]));
writeWav("arcade-coin.wav", render([
  { freq: 987.8, duration: 0.07, wave: "square", volume: 0.3, crush: 8 },
  { freq: 1318.5, duration: 0.35, wave: "square", volume: 0.3, crush: 8, start: 0.07 },
]));
writeWav("arcade-powerup.wav", render(
  [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].map((freq, i) => ({
    freq,
    duration: 0.09,
    wave: "square" as const,
    volume: 0.28,
    crush: 8,
    start: i * 0.075,
  })).concat([{ freq: 1568, duration: 0.4, wave: "square" as const, volume: 0.28, crush: 8, start: 0.45 }]),
));

// PRO (cinematic hits)
writeWav("impact.wav", render([
  { freq: 140, freqEnd: 38, duration: 0.55, wave: "sine", volume: 0.9 },
  { freq: 0, duration: 0.25, wave: "noise", volume: 0.5 },
]));
writeWav("riser.wav", render([
  { freq: 0, duration: 1.0, wave: "noise", volume: 0.18, attack: 0.9 },
  { freq: 220, freqEnd: 880, duration: 1.0, wave: "triangle", volume: 0.12, attack: 0.9 },
]));
writeWav("shimmer.wav", render(
  [1318.5, 1760, 2093, 2637].map((freq, i) => ({
    freq,
    duration: 0.9,
    wave: "sine" as const,
    volume: 0.14,
    start: i * 0.06,
  })),
));
