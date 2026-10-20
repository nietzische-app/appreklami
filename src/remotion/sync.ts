import { spring } from "remotion";
import { FPS } from "../shared/video";
import type { SfxName } from "./sfx-manifest";
import { HOOK, OUTRO, featureScene } from "./timeline";

/**
 * Single source of truth for "when does the picture hit". The visual components read their timings from here and the
 * sound tracks are derived from the same numbers, so sound and picture cannot drift apart.
 *
 * Convention: a sound's `hit` is the absolute frame where its transient/peak lands. For springs that is the frame of
 * peak velocity (the fastest motion), for linear fades the midpoint of the ramp, for cuts the first frame of the cut.
 */

export const WORD_SPRING = { damping: 9, stiffness: 160, mass: 0.7 };
export const WORD_SPRING_SOFT = { damping: 200 };
export const CTA_SPRING = { damping: 8, stiffness: 140 };

/** Frame offset (from the spring's first frame) where the spring moves fastest. Computed, not guessed. */
export function peakVelocityFrame(config: { damping?: number; stiffness?: number; mass?: number }): number {
  let best = 0;
  let at = 1;
  for (let f = 1; f < 60; f++) {
    const v = spring({ frame: f, fps: FPS, config }) - spring({ frame: f - 1, fps: FPS, config });
    if (v > best) {
      best = v;
      at = f;
    }
  }
  return at;
}

export const WORD_PEAK = peakVelocityFrame(WORD_SPRING);
export const CTA_PEAK = peakVelocityFrame(CTA_SPRING);

export const HOOK_WORD_DELAY = 6;
export const HOOK_WORD_STAGGER = 5;
export const FEATURE_TITLE_DELAY = 2;
export const FEATURE_DESC_RAMP: [number, number] = [18, 32];
export const OUTRO_CTA_DELAY = 24;

export const rampMidpoint = (from: number, to: number) => Math.round((from + to) / 2);

export const hookWordHit = (i: number) => HOOK.from + HOOK_WORD_DELAY + i * HOOK_WORD_STAGGER + WORD_PEAK;
export const featureTitleHit = (i: number) => featureScene(i).from + FEATURE_TITLE_DELAY + WORD_PEAK;
export const featureDescHit = (i: number) => featureScene(i).from + rampMidpoint(...FEATURE_DESC_RAMP);
export const ctaHit = () => OUTRO.from + OUTRO_CTA_DELAY + CTA_PEAK;

/** Scene cuts of the PRO video: camera punch, shake and flash all start on exactly these frames. */
export const PRO_BEATS = [HOOK.from + 2, featureScene(0).from, featureScene(1).from, featureScene(2).from, OUTRO.from];

/** Basic (option 1) fades each scene in linearly; the sound lands in the middle of the ramp. */
export const BASIC_FADE_IN = { hook: 10, feature: 10, outro: 14 };

export interface SfxEvent {
  name: SfxName;
  /** Absolute frame where the transient lands. */
  hit: number;
  volume: number;
}

export const basicSfxEvents = (featureCount: number): SfxEvent[] => [
  { name: "soft-chime", hit: HOOK.from + rampMidpoint(0, BASIC_FADE_IN.hook), volume: 0.6 },
  ...Array.from({ length: featureCount }, (_, i): SfxEvent => ({ name: "soft-whoosh", hit: featureScene(i).from + rampMidpoint(0, BASIC_FADE_IN.feature), volume: 0.5 })),
  { name: "soft-chime", hit: OUTRO.from + rampMidpoint(0, BASIC_FADE_IN.outro), volume: 0.7 },
];

export const arcadeSfxEvents = (words: number, featureCount: number): SfxEvent[] => [
  ...Array.from({ length: words }, (_, i): SfxEvent => ({ name: "arcade-blip", hit: hookWordHit(i), volume: 0.35 })),
  ...Array.from({ length: featureCount }, (_, i): SfxEvent[] => [
    { name: "arcade-coin", hit: featureTitleHit(i), volume: 0.55 },
    { name: "arcade-blip", hit: featureDescHit(i), volume: 0.3 },
  ]).flat(),
  { name: "arcade-powerup", hit: ctaHit(), volume: 0.6 },
];

export const proSfxEvents = (): SfxEvent[] => [
  ...PRO_BEATS.map((b): SfxEvent => ({ name: "impact", hit: b, volume: 0.8 })),
  { name: "riser", hit: featureScene(0).from, volume: 0.45 },
  { name: "shimmer", hit: ctaHit(), volume: 0.5 },
];
