import { SCENE_COUNT, type EnterFrom, type SceneDirection, type TextPosition } from "./types";

/** Pure (browser-safe) validation of scene directions; shared by the analyzer and the Remotion props normaliser. */
export const TEXT_POSITIONS: readonly TextPosition[] = ["top", "center", "bottom"];
export const ENTER_EDGES: readonly EnterFrom[] = ["left", "right", "top", "bottom"];

/** Used when nothing else is available (Remotion Studio defaults, malformed props). Neighbours always differ. */
export const DEFAULT_SCENES: SceneDirection[] = [
  { textPosition: "bottom", enterFrom: "bottom", zoom: { x: 50, y: 35, scale: 1.15 } },
  { textPosition: "top", enterFrom: "right", zoom: { x: 70, y: 30, scale: 1.25 } },
  { textPosition: "bottom", enterFrom: "left", zoom: { x: 30, y: 60, scale: 1.2 } },
  { textPosition: "center", enterFrom: "top", zoom: { x: 55, y: 55, scale: 1.25 } },
  { textPosition: "center", enterFrom: "bottom", zoom: { x: 50, y: 40, scale: 1.1 } },
];

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function sanitizeScene(raw: unknown, fallback: SceneDirection): SceneDirection {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const text = typeof r.textPosition === "string" ? (r.textPosition.toLowerCase() as TextPosition) : undefined;
  const enter = typeof r.enterFrom === "string" ? (r.enterFrom.toLowerCase() as EnterFrom) : undefined;
  const z = (r.zoom && typeof r.zoom === "object" ? r.zoom : {}) as Record<string, unknown>;
  return {
    textPosition: text && TEXT_POSITIONS.includes(text) ? text : fallback.textPosition,
    enterFrom: enter && ENTER_EDGES.includes(enter) ? enter : fallback.enterFrom,
    zoom: {
      x: round1(clamp(num(z.x) ?? fallback.zoom.x, 0, 100)),
      y: round1(clamp(num(z.y) ?? fallback.zoom.y, 0, 100)),
      scale: round1(clamp(num(z.scale) ?? fallback.zoom.scale, 1, 1.5)),
    },
  };
}

/** Exactly SCENE_COUNT valid directions; unusable entries come from `fallback`. */
export function sanitizeSceneList(raw: unknown, fallback: SceneDirection[] = DEFAULT_SCENES): SceneDirection[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: SCENE_COUNT }, (_, i) => sanitizeScene(list[i], fallback[i % fallback.length]));
}
