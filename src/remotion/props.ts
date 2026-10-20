import { DEFAULT_SCENES, sanitizeSceneList } from "../shared/scenes";
import { THEME_IDS, type Feature, type MediaAsset, type ProjectType, type ScreenContent, type ThemeId, type VideoProps } from "../shared/types";
import { PALETTES } from "./theme";

const TYPES: ProjectType[] = ["game", "mobile-app", "saas-web"];

export const FALLBACK_FEATURES: Feature[] = [
  { title: "Built to be used", description: "A focused product with a clear purpose." },
  { title: "Easy to get started", description: "Up and running in a few minutes." },
  { title: "Made to grow with you", description: "Simple today, flexible tomorrow." },
];

export const defaultProps: VideoProps = {
  projectName: "Demo Project",
  projectType: "saas-web",
  tagline: "A demo project for previewing compositions.",
  hook: "Meet Demo Project.",
  features: FALLBACK_FEATURES,
  outro: "Try it today.",
  cta: "Get started",
  media: [],
  screen: { tagline: "", features: [] },
  theme: "saas",
  scenes: DEFAULT_SCENES,
  watermark: true,
  ...PALETTES["saas-web"],
};

const text = (v: unknown, fallback: string): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const color = (v: unknown, fallback: string): string => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback);

function normalizeMedia(input: unknown): MediaAsset[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): MediaAsset[] => {
    if (!raw || typeof raw !== "object") return [];
    const m = raw as Partial<MediaAsset>;
    if (typeof m.src !== "string" || !m.src.trim()) return [];
    const kind = m.kind === "video" ? "video" : "image";
    return [
      {
        kind,
        src: m.src,
        width: num(m.width) ?? 1080,
        height: num(m.height) ?? 1920,
        poster: typeof m.poster === "string" && m.poster ? m.poster : undefined,
        startOffsetSec: typeof m.startOffsetSec === "number" && m.startOffsetSec >= 0 ? m.startOffsetSec : undefined,
        durationSec: num(m.durationSec),
        origin: m.origin ?? "repo-asset",
      },
    ];
  });
}

function normalizeScreen(input: unknown): ScreenContent {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const features = Array.isArray(o.features)
    ? o.features.flatMap((f): Feature[] => {
        const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        const title = text(r.title, "");
        return title ? [{ title, description: text(r.description, "") }] : [];
      })
    : [];
  return { tagline: typeof o.tagline === "string" ? o.tagline.trim() : "", features: features.slice(0, 3) };
}

/**
 * Makes any props payload safe for the compositions: missing or malformed text gets neutral defaults, missing
 * colours come from the project-type palette, broken media entries are dropped (the phone then shows generated UI).
 * Rendering never stops because a prop is absent.
 */
export function normalizeVideoProps(input: unknown): VideoProps {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const projectType = TYPES.includes(p.projectType as ProjectType) ? (p.projectType as ProjectType) : defaultProps.projectType;
  const palette = PALETTES[projectType];
  const projectName = text(p.projectName, defaultProps.projectName);

  const given = Array.isArray(p.features)
    ? p.features.flatMap((f): Feature[] => {
        const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        const title = text(o.title, "");
        return title ? [{ title, description: text(o.description, "") }] : [];
      })
    : [];
  const features = [...given, ...FALLBACK_FEATURES].slice(0, 3);

  return {
    projectName,
    projectType,
    tagline: text(p.tagline, `${projectName}.`),
    hook: text(p.hook, `Meet ${projectName}.`),
    features,
    outro: text(p.outro, defaultProps.outro),
    cta: text(p.cta, defaultProps.cta),
    media: normalizeMedia(p.media),
    screen: normalizeScreen(p.screen),
    theme: THEME_IDS.includes(p.theme as ThemeId) ? (p.theme as ThemeId) : defaultProps.theme,
    scenes: sanitizeSceneList(p.scenes),
    watermark: typeof p.watermark === "boolean" ? p.watermark : true,
    accent: color(p.accent, palette.accent),
    accent2: color(p.accent2, palette.accent2),
  };
}
