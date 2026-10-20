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

export interface ProjectAnalysis {
  name: string;
  tagline: string;
  projectType: ProjectType;
  /** 0..1 confidence of the project type heuristic. */
  confidence: number;
  readmeExcerpt: string;
  /** Absolute paths of candidate images on disk (best first). */
  images: string[];
  readmeFeatures: string[];
  storyboards: Storyboard[];
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
  /** Paths relative to the Remotion public dir (resolved with staticFile). */
  images: string[];
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

export type JobStatus = "queued" | "analyzing" | "rendering" | "completed" | "failed";
export type VideoStatus = "pending" | "rendering" | "completed" | "failed" | "skipped";

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
