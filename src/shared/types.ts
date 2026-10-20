export type ProjectType = "game" | "mobile-app" | "saas-web";

export type TierId = "basic" | "dynamic" | "pro";

export type Feature = {
  title: string;
  description: string;
};

/** One marketing storyboard = the copy for one of the three videos. */
export interface Storyboard {
  id: string;
  angle: string;
  hook: string;
  features: Feature[];
  outro: string;
  cta: string;
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

export interface ProjectAnalysis {
  name: string;
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
  storyboards: Storyboard[];
  /** "ai" when an LLM wrote the storyboards, "template" for the built-in copy. */
  copySource: "ai" | "template";
}

/** Props accepted by every Remotion composition (serialised to JSON for the CLI). */
export type VideoProps = {
  projectName: string;
  projectType: ProjectType;
  tagline: string;
  hook: string;
  features: Feature[];
  outro: string;
  cta: string;
  /** Paths relative to the Remotion public dir (resolved with staticFile). Empty -> generated dashboard UI in the phone. */
  media: MediaAsset[];
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
  error?: string;
}

export interface JobState {
  jobId: string;
  status: JobStatus;
  /** Overall progress, 0..100. */
  progress: number;
  plan: Plan;
  source: SourceInput;
  analysis?: Pick<ProjectAnalysis, "name" | "tagline" | "projectType" | "confidence" | "storyboards"> & {
    imageCount: number;
    mediaOrigin: MediaOrigin;
    liveUrl?: string;
    copySource: "ai" | "template";
  };
  videos: VideoState[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type Plan = "free" | "pro";

export type SourceInput =
  | { type: "github"; url: string }
  | { type: "local"; path: string };
