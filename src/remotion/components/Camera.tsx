import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

/** Frames on which a "hit" happens (scene cuts); drives punch-in zoom and screen shake. */
export const decay = (frame: number, beats: number[], length: number) => {
  let best = 0;
  for (const b of beats) {
    const t = frame - b;
    if (t >= 0 && t < length) best = Math.max(best, 1 - t / length);
  }
  return best * best;
};

interface CameraProps {
  beats: number[];
  children: React.ReactNode;
}

/** Slow push-in over the whole video plus a quick punch-in on every beat and a gentle handheld drift. */
export const DynamicCamera: React.FC<CameraProps> = ({ beats, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const push = interpolate(frame, [0, durationInFrames], [1.0, 1.12]);
  const punch = decay(frame, beats, 14) * 0.07;
  const driftX = Math.sin(frame / 37) * 14;
  const driftY = Math.cos(frame / 41) * 18;
  return (
    <AbsoluteFill style={{ transform: `translate(${driftX}px, ${driftY}px) scale(${push + punch})`, transformOrigin: "50% 50%" }}>
      {children}
    </AbsoluteFill>
  );
};

interface ShakeProps {
  beats: number[];
  intensity?: number;
  children: React.ReactNode;
}

/** Deterministic screen shake (uses remotion's seeded random so renders are reproducible). */
export const ScreenShake: React.FC<ShakeProps> = ({ beats, intensity = 26, children }) => {
  const frame = useCurrentFrame();
  const power = decay(frame, beats, 10) * intensity;
  const dx = (random(`shake-x-${frame}`) - 0.5) * 2 * power;
  const dy = (random(`shake-y-${frame}`) - 0.5) * 2 * power;
  const rot = (random(`shake-r-${frame}`) - 0.5) * 2 * (power / intensity) * 1.2;
  return (
    <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)` }}>{children}</AbsoluteFill>
  );
};
