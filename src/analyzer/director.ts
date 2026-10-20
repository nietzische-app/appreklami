import { createHash } from "node:crypto";
import {
  SCENE_COUNT,
  THEME_IDS,
  type ProjectType,
  type SceneDirection,
  type Storyboard,
  type ThemeId,
  type ThemeSource,
  type UserIntent,
} from "../shared/types";
import { ENTER_EDGES, TEXT_POSITIONS, sanitizeSceneList } from "../shared/scenes";

/**
 * "AI director" helpers: pick the visual theme and stage every scene. The LLM proposes both (see copywriter.ts);
 * everything it returns is validated here, and a seeded fallback keeps renders varied and reproducible without an LLM.
 * Nothing in this file touches what the phone shows: the wizard answers only steer captions and these directions.
 */

export const normalizeTheme = (raw: unknown): ThemeId | undefined => {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().toLowerCase().replace(/theme$/, "").trim();
  return (THEME_IDS as readonly string[]).includes(t) ? (t as ThemeId) : undefined;
};

export interface ThemeChoice {
  theme: ThemeId;
  source: ThemeSource;
}

/** Heuristic used when no LLM answered: games get Arcade, viral tone or mobile apps get Action, everything else SaaS. */
export function heuristicTheme(projectType: ProjectType, intent?: UserIntent): ThemeId {
  if (projectType === "game") return "arcade";
  if (intent?.targetAudience === "viral" || projectType === "mobile-app") return "action";
  return "saas";
}

/** Priority: the user's wizard choice, then the LLM director, then the heuristic. */
export function chooseTheme(input: { projectType: ProjectType; intent?: UserIntent; llmTheme?: ThemeId }): ThemeChoice {
  if (input.intent?.theme) return { theme: input.intent.theme, source: "user" };
  if (input.llmTheme) return { theme: input.llmTheme, source: "ai" };
  return { theme: heuristicTheme(input.projectType, input.intent), source: "auto" };
}

/** mulberry32 seeded from a string: same project + storyboard always gets the same layout. */
function rng(seed: string): () => number {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, list: readonly T[], not?: T): T => {
  const pool = not === undefined ? list : list.filter((x) => x !== not);
  return pool[Math.floor(rand() * pool.length)];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Seeded creative layout: neighbouring scenes never repeat position or entry edge, zoom points are spread out. */
export function randomScenes(seed: string): SceneDirection[] {
  const rand = rng(seed);
  const scenes: SceneDirection[] = [];
  for (let i = 0; i < SCENE_COUNT; i++) {
    const prev = scenes[i - 1];
    scenes.push({
      textPosition: pick(rand, TEXT_POSITIONS, prev?.textPosition),
      enterFrom: pick(rand, ENTER_EDGES, prev?.enterFrom),
      zoom: { x: round1(15 + rand() * 70), y: round1(15 + rand() * 70), scale: round1(1.12 + rand() * 0.2) },
    });
  }
  return scenes;
}

/** Always returns exactly SCENE_COUNT valid directions, using the LLM's where they are usable. */
export function sanitizeScenes(raw: unknown, seed: string): SceneDirection[] {
  return sanitizeSceneList(raw, randomScenes(seed));
}

/** Fills `scenes` on every storyboard; directions that are already valid (from the LLM) are kept. */
export function directStoryboards(stories: Storyboard[], projectName: string): Storyboard[] {
  return stories.map((story) => ({ ...story, scenes: sanitizeScenes(story.scenes, `${projectName}:${story.id}`) }));
}
