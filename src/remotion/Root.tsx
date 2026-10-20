import React from "react";
import { Composition } from "remotion";
import { DURATION_FRAMES, FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "../shared/video";
import type { VideoProps } from "../shared/types";
import { BasicVideo } from "./compositions/BasicVideo";
import { DynamicVideo } from "./compositions/DynamicVideo";
import { ProVideo } from "./compositions/ProVideo";
import { PALETTES } from "./theme";

export const defaultProps: VideoProps = {
  projectName: "Demo Project",
  projectType: "saas-web",
  tagline: "A demo project for previewing compositions.",
  hook: "Ship faster with Demo Project.",
  features: [
    { title: "Launch in minutes", description: "Skip the setup, start with results." },
    { title: "One clear dashboard", description: "See everything that matters at a glance." },
    { title: "Automate the busywork", description: "Let Demo Project handle the repetitive parts." },
  ],
  outro: "Work smarter.",
  cta: "Start free",
  media: [],
  watermark: true,
  ...PALETTES["saas-web"],
};

const common = {
  durationInFrames: DURATION_FRAMES,
  fps: FPS,
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  defaultProps,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="promo-basic" component={BasicVideo} {...common} />
    <Composition id="promo-dynamic" component={DynamicVideo} {...common} />
    <Composition id="promo-pro" component={ProVideo} {...common} defaultProps={{ ...defaultProps, watermark: false }} />
  </>
);
