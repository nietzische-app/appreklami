import type { ProjectType } from "../shared/types";

export const PALETTES: Record<ProjectType, { accent: string; accent2: string }> = {
  game: { accent: "#ffd400", accent2: "#ff3e8a" },
  "mobile-app": { accent: "#4cc9f0", accent2: "#7b5cff" },
  "saas-web": { accent: "#5eead4", accent2: "#6366f1" },
};

export const FONT_SANS = '"Inter", "Segoe UI", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
export const FONT_MONO = '"Courier New", "DejaVu Sans Mono", Menlo, monospace';

/** Shrinks big headline text for long copy so it never overflows the 1080px-wide frame. */
export const fitFont = (text: string, max: number, min: number) =>
  Math.round(Math.max(min, Math.min(max, max * Math.sqrt(26 / Math.max(text.length, 1)))));
