import React from "react";
import { Composition } from "remotion";
import { DURATION_FRAMES, FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "../shared/video";
import type { VideoProps } from "../shared/types";
import { BasicVideo } from "./compositions/BasicVideo";
import { DynamicVideo } from "./compositions/DynamicVideo";
import { ProVideo } from "./compositions/ProVideo";
import { defaultProps, normalizeVideoProps } from "./props";

const calculateMetadata = ({ props }: { props: VideoProps }) => ({ props: normalizeVideoProps(props) });

const common = {
  calculateMetadata,
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
