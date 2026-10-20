import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/** Fades its children in/out at the edges of the surrounding <Sequence>. */
export const Fade: React.FC<{ children: React.ReactNode; inFrames?: number; outFrames?: number }> = ({
  children,
  inFrames = 10,
  outFrames = 8,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, inFrames, durationInFrames - outFrames, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
