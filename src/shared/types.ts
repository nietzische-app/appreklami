export type ProjectType = "game" | "mobile-app" | "saas-web";

export type TierId = "basic" | "dynamic" | "pro";

export type Feature = {
  title: string;
  description: string;
};

/** Visual + sound identity of a video (see src/remotion/ThemeEngine.tsx). */
export type ThemeId = "arcade" | "saas" | "action";
export const THEME_IDS: readonly ThemeId[] = ["arcade", "saas", "action"];
/** Who chose the theme: the user in the wizard, the LLM director, or the built-in heuristic. */
export type ThemeSource = "user" | "ai" | "auto";

export type TextPosition = "top" | "center" | "bottom";
export type EnterFrom = "left" | "right" | "top" | "bottom";

/** How one scene is staged. Produced by the LLM director (or a seeded fallback), never by wizard text. */
export interface SceneDirection {
  /** Where the caption block sits; the phone takes the opposite side. */
  textPosition: TextPosition;
  /** Edge the phone flies in from. */
  enterFrom: EnterFrom;
  /** Camera zoom into the phone screen: focus point in percent of the screen (0..100) and end scale (1..1.5). */
  zoom: { x: number; y: number; scale: number };
}

/** Scene order of the 18 s promo: hook, three features, outro. */
export const SCENE_COUNT = 5;

/** One marketing storyboard = the copy and staging for one of the three videos. */
export interface Storyboard {
  id: string;
  angle: string;
  hook: string;
  features: Feature[];
  outro: string;
  cta: string;
  /** Staging for the SCENE_COUNT scenes. Always filled after analysis. */
  scenes?: SceneDirection[];
}

export type MediaOrigin = "live-demo" | "repo-assets" | "generated-ui";

/** A screenshot or screen recording shown inside the phone mockup. `src` is absolute on disk during analysis and public-dir-relative inside VideoProps. */
export type MediaAsset = {
  kind: "video" | "image";
  src: string;
  width: number;
  height: number;
  /** Still frame of a video (also used for the blurred background). */
  poster?: string;
  /** Videos: seconds to skip (page load) and usable length. */
  startOffsetSec?: number;
  durationSec?: number;
  origin: "live-demo" | "repo-asset";
};

/**
 * What the phone shows when no real media exists. Derived ONLY from the repository (README / manifest), never from
 * the wizard: the owner's description and key feature are overlay copy, not screen content.
 */
export interface ScreenContent {
  tagline: string;
  features: Feature[];
}

export interface ProjectAnalysis {
  name: string;
  /** Repository-derived tagline (README / manifest). */
  tagline: string;
  projectType: ProjectType;
  /** 0..1 confidence of the project type heuristic. */
  confidence: number;
  readmeExcerpt: string;
  /** Screen recordings / screenshots for the phone mockup (absolute paths, best first). Empty -> generated UI. */
  media: MediaAsset[];
  mediaOrigin: MediaOrigin;
  /** Live product URL that was found in the repo (README / package.json), if any. */
  liveUrl?: string;
  /** Human-readable log of how media was found; shown for debugging. */
  mediaNotes: string[];
  /** Scratch dir holding downloaded/recorded media; the caller deletes it. */
  tempDir?: string;
  readmeFeatures: string[];
  /** Repo-only content for the phone fallback screen (see ScreenContent). */
  screen: ScreenContent;
  storyboards: Storyboard[];
  /** "ai" when an LLM wrote the storyboards, "template" for the built-in copy. */
  copySource: "ai" | "template";
  theme: ThemeId;
  themeSource: ThemeSource;
}

/** Props accepted by every Remotion composition (serialised to JSON for the CLI). */
export type VideoProps = {
  projectName: string;
  projectType: ProjectType;
  tagline: string;
  /** Overlay copy (captions on top of the video). */
  hook: string;
  features: Feature[];
  outro: string;
  cta: string;
  /** Paths relative to the Remotion public dir (resolved with staticFile). Real repo/site media only. */
  media: MediaAsset[];
  /** Phone fallback when `media` is empty; repo-derived only. */
  screen: ScreenContent;
  theme: ThemeId;
  /** SCENE_COUNT staging directions (hook, feature 1-3, outro). */
  scenes: SceneDirection[];
  watermark: boolean;
  accent: string;
  accent2: string;
};

export interface TierConfig {
  id: TierId;
  option: 1 | 2 | 3;
  label: string;
  compositionId: string;
  /** Remotion --scale factor applied on top of the 1080x1920 composition. */
  scale: number;
  watermark: boolean;
  premium: boolean;
  crf: number;
}

export type JobStatus = "queued" | "analyzing" | "rendering" | "completed" | "failed" | "cancelled";
export type VideoStatus = "pending" | "rendering" | "completed" | "failed" | "skipped" | "cancelled";

export interface VideoState {
  tier: TierId;
  option: 1 | 2 | 3;
  label: string;
  status: VideoStatus;
  /** 0..100 */
  progress: number;
  resolution: string;
  watermark: boolean;
  /** Public URL, e.g. /renders/<jobId>/option-1-basic.mp4 */
  url?: string;
  /** Locked PRO tiers only: short, pre-blurred low-resolution teaser (never the real video). */
  previewUrl?: string;
  error?: string;
}

export interface JobState {
  jobId: string;
  status: JobStatus;
  /** Overall progress, 0..100. */
  progress: number;
  plan: Plan;
  source: SourceInput;
  intent?: UserIntent;
  analysis?: Pick<ProjectAnalysis, "name" | "tagline" | "projectType" | "confidence" | "storyboards"> & {
    imageCount: number;
    mediaOrigin: MediaOrigin;
    liveUrl?: string;
    copySource: "ai" | "template";
    theme: ThemeId;
    themeSource: ThemeSource;
  };
  videos: VideoState[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type Plan = "free" | "pro";

/** Video tone chosen in the wizard ("Developer/B2B", "Viral/Trendy", "Minimal/Sade"). */
export type Tone = "developer" | "viral" | "minimal";

/** What the owner tells us about the project; all fields optional. */
export interface UserIntent {
  /** One sentence: what does the project do? */
  projectDescription?: string;
  /** The feature to emphasise (e.g. Integrations, Speed, Design, Pricing). Drives scenes 1-2 and which pages are filmed. */
  keyFeature?: string;
  targetAudience?: Tone;
  /** Visual theme picked in the wizard; absent = let the AI director choose. */
  theme?: ThemeId;
}

export type SourceInput =
  | { type: "github"; url: string }
  | { type: "local"; path: string };
