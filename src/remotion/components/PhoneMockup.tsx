import React from "react";
import { Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { MediaAsset, ProjectType, ScreenContent, ThemeId } from "../../shared/types";
import { phoneFrameStyle } from "../ThemeEngine";
import { DynamicGeneratedUI } from "./DynamicGeneratedUI";

/** Everything the phone is allowed to know. Overlay copy (hook, wizard text) is intentionally not here. */
export interface PhoneProject {
  projectName: string;
  projectType: ProjectType;
  accent: string;
  accent2: string;
  screen: ScreenContent;
}

interface Props {
  /** Screen recording / screenshot from the repo or its live site. Missing -> generated UI built from repo content only. */
  media?: MediaAsset;
  project: PhoneProject;
  theme: ThemeId;
  /** -1 hook, 0..2 feature scenes, 3 outro. */
  sceneIndex: number;
  /** Where in the recording this scene starts (frames), so scenes show different parts of the page. */
  videoOffsetFrames?: number;
  /** Director zoom into the screen (focus in % and end scale). */
  zoom?: { x: number; y: number; scale: number };
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

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

/** Phone frame whose screen is never empty: a real recording/screenshot, otherwise UI generated from the repo (never from wizard text). */
export const PhoneMockup: React.FC<Props> = ({ media, project, theme, sceneIndex, videoOffsetFrames = 0, zoom, width = 600, height = 940, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const look = phoneFrameStyle(theme, { ...project, bg: "#000", text: "#fff", muted: "#aaa" });
  const screenW = width - look.bezel * 2;
  const screenH = height - look.bezel * 2;
  const zoomScale = zoom ? interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1, zoom.scale], { extrapolateRight: "clamp" }) : 1;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: look.borderRadius,
        padding: look.bezel,
        background: look.background,
        border: look.border,
        boxShadow: look.boxShadow,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: look.screenRadius, overflow: "hidden", background: "#050505" }}>
        <div style={{ width: "100%", height: "100%", transform: `scale(${zoomScale})`, transformOrigin: `${zoom?.x ?? 50}% ${zoom?.y ?? 40}%` }}>
          {media?.src ? (
            <MediaScreen media={media} screenW={screenW} screenH={screenH} offsetFrames={videoOffsetFrames} />
          ) : (
            <DynamicGeneratedUI
              width={screenW - 4}
              height={screenH - 4}
              name={project.projectName}
              tagline={project.screen.tagline}
              projectType={project.projectType}
              features={project.screen.features}
              accent={project.accent}
              accent2={project.accent2}
              sceneIndex={sceneIndex}
            />
          )}
        </div>
        <div style={{ position: "absolute", top: 14, left: "50%", width: 120, height: 28, transform: "translateX(-50%)", borderRadius: 99, background: "#050505" }} />
      </div>
    </div>
  );
};
