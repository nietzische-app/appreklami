import React from "react";
import { Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { MediaAsset, VideoProps } from "../../shared/types";
import { DynamicGeneratedUI } from "./DynamicGeneratedUI";

interface Props {
  /** Screen recording / screenshot. Missing -> a generated dashboard UI is shown instead of an empty phone. */
  media?: MediaAsset;
  project: VideoProps;
  /** -1 hook, 0..2 feature scenes, 3 outro. */
  sceneIndex: number;
  /** Where in the recording this scene starts (frames), so scenes show different parts of the page. */
  videoOffsetFrames?: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

const BEZEL = 10;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const MediaScreen: React.FC<{ media: MediaAsset; screenW: number; screenH: number; offsetFrames: number }> = ({ media, screenW, screenH, offsetFrames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const mediaUrl = staticFile(media.src);

  if (media.kind === "video") {
    const usable = Math.floor((media.durationSec ?? 10) * fps);
    const start = Math.round((media.startOffsetSec ?? 0) * fps) + Math.max(0, Math.min(offsetFrames, usable - durationInFrames));
    return <OffthreadVideo src={mediaUrl} startFrom={start} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }

  // Screenshot: fill the screen with `cover`, then glide along the overflowing axis (a slow "scroll") with a light push-in.
  const t = ease(Math.min(1, frame / Math.max(1, durationInFrames - 1)));
  const taller = media.width / media.height < screenW / screenH;
  const objectPosition = taller ? `50% ${t * 100}%` : `${t * 100}% 50%`;
  const zoom = interpolate(t, [0, 1], [1, 1.08]);
  return (
    <Img
      src={mediaUrl}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition, transform: `scale(${zoom})`, transformOrigin: "50% 40%" }}
    />
  );
};

/** Phone frame whose screen is never empty: recording/screenshot if available, otherwise generated UI. */
export const PhoneMockup: React.FC<Props> = ({ media, project, sceneIndex, videoOffsetFrames = 0, width = 600, height = 940, style }) => {
  const screenW = width - BEZEL * 2;
  const screenH = height - BEZEL * 2;
  const mediaUrl = media?.src;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 64,
        padding: BEZEL,
        background: "#0c0e1d",
        border: "4px solid rgba(255,255,255,0.22)",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.06)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 54, overflow: "hidden", background: "#0b0d1a" }}>
        {mediaUrl && media ? (
          <MediaScreen media={media} screenW={screenW} screenH={screenH} offsetFrames={videoOffsetFrames} />
        ) : (
          <DynamicGeneratedUI
            width={screenW - 4}
            height={screenH - 4}
            name={project.projectName}
            tagline={project.tagline}
            projectType={project.projectType}
            features={project.features}
            accent={project.accent}
            accent2={project.accent2}
            sceneIndex={sceneIndex}
          />
        )}
        <div style={{ position: "absolute", top: 14, left: "50%", width: 120, height: 28, transform: "translateX(-50%)", borderRadius: 99, background: "#05060d" }} />
      </div>
    </div>
  );
};
