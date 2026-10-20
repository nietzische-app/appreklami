import { spring } from "remotion";
import { FPS } from "../shared/video";
import type { ThemeId, TierId } from "../shared/types";
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

/** Sound roles a theme can fill. Tiers decide how many roles are played (Basic few and soft, PRO all of them). */
export type SfxRole = "open" | "scene" | "cta" | "word" | "title" | "desc" | "punch" | "build" | "finale";
type Cue = { name: SfxName; volume: number };

/**
 * The sound palette of each theme. `open` = first frame of the hook, `scene` = start of each feature scene,
 * `word`/`title`/`desc` = kinetic text accents, `punch` = camera hit on every cut (PRO), `build` = riser into the first
 * feature (PRO), `cta` = call to action, `finale` = tail on the CTA (PRO).
 */
export const THEME_SFX: Record<ThemeId, Partial<Record<SfxRole, Cue>>> = {
  arcade: {
    open: { name: "arcade-blip", volume: 0.4 },
    scene: { name: "arcade-blip", volume: 0.4 },
    word: { name: "arcade-blip", volume: 0.35 },
    title: { name: "arcade-coin", volume: 0.55 },
    desc: { name: "arcade-blip", volume: 0.3 },
    cta: { name: "arcade-powerup", volume: 0.6 },
  },
  saas: {
    open: { name: "soft-chime", volume: 0.6 },
    scene: { name: "soft-whoosh", volume: 0.5 },
    word: { name: "soft-tick", volume: 0.25 },
    title: { name: "soft-whoosh", volume: 0.3 },
    cta: { name: "soft-chime", volume: 0.7 },
    punch: { name: "impact", volume: 0.3 },
    build: { name: "riser", volume: 0.3 },
    finale: { name: "shimmer", volume: 0.4 },
  },
  action: {
    open: { name: "impact", volume: 0.7 },
    scene: { name: "impact", volume: 0.75 },
    word: { name: "snap", volume: 0.35 },
    title: { name: "snap", volume: 0.5 },
    cta: { name: "impact", volume: 0.8 },
    punch: { name: "impact", volume: 0.8 },
    build: { name: "riser", volume: 0.45 },
    finale: { name: "shimmer", volume: 0.5 },
  },
};

const TIER_ROLES: Record<TierId, SfxRole[]> = {
  basic: ["open", "scene", "cta"],
  dynamic: ["word", "title", "desc", "cta"],
  pro: ["word", "title", "desc", "punch", "build", "cta", "finale"],
};

/**
 * All sound events of one video. Picture and sound read the same timing table above, so they cannot drift:
 * Basic fades each scene in (sound lands mid-ramp), Dynamic/PRO cut or spring in (sound lands on the visual's peak).
 */
export function sfxEvents(theme: ThemeId, tier: TierId, wordCount: number, featureCount: number): SfxEvent[] {
  const cues = THEME_SFX[theme];
  const roles = new Set(TIER_ROLES[tier]);
  const out: SfxEvent[] = [];
  const add = (role: SfxRole, hit: number) => {
    const cue = cues[role];
    if (roles.has(role) && cue) out.push({ name: cue.name, hit, volume: cue.volume });
  };
  const ramp = (kind: keyof typeof BASIC_FADE_IN) => (tier === "basic" ? rampMidpoint(0, BASIC_FADE_IN[kind]) : 0);

  add("open", HOOK.from + ramp("hook"));
  for (let i = 0; i < wordCount; i++) add("word", hookWordHit(i));
  for (let i = 0; i < featureCount; i++) {
    add("scene", featureScene(i).from + ramp("feature"));
    add("title", featureTitleHit(i));
    add("desc", featureDescHit(i));
  }
  for (const beat of PRO_BEATS) add("punch", beat);
  add("build", featureScene(0).from);
  const cta = tier === "basic" ? OUTRO.from + ramp("outro") : ctaHit();
  add("cta", cta);
  add("finale", cta + 12);
  return out;
}
