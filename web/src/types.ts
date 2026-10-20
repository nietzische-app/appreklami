export type VideoStatus = "pending" | "rendering" | "completed" | "failed" | "skipped" | "cancelled";
export type JobStatus = "queued" | "analyzing" | "rendering" | "completed" | "failed" | "cancelled";

export interface Video {
  tier: "basic" | "dynamic" | "pro";
  option: 1 | 2 | 3;
  label: string;
  status: VideoStatus;
  progress: number;
  resolution: string;
  watermark: boolean;
  url?: string;
  error?: string;
}

export interface Storyboard {
  id: string;
  angle: string;
  hook: string;
  features: { title: string; description: string }[];
  outro: string;
  cta: string;
}

export interface Job {
  jobId: string;
  status: JobStatus;
  progress: number;
  plan: "free" | "pro";
  videos: Video[];
  error?: string;
  analysis?: { name: string; tagline: string; projectType: "game" | "mobile-app" | "saas-web"; confidence: number; storyboards: Storyboard[]; imageCount: number; mediaOrigin: "live-demo" | "repo-assets" | "generated-ui"; liveUrl?: string; copySource?: "ai" | "template" };
}

export interface ServerConfig {
  localSources: boolean;
  plan: "free" | "pro";
  durationSeconds: number;
}
