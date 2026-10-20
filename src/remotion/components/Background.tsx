import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  image?: string;
  accent: string;
  accent2: string;
  blur?: number;
  /** Slowly drifting gradient angle; used by the animated tiers. */
  animated?: boolean;
}

export const Background: React.FC<Props> = ({ image, accent, accent2, blur = 40, animated = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const angle = animated ? interpolate(frame, [0, durationInFrames], [150, 330]) : 150;
  const drift = animated ? interpolate(frame, [0, durationInFrames], [1.25, 1.45]) : 1.3;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, #0b0d1a 0%, ${accent2}55 55%, ${accent}33 100%)` }}>
      {image ? (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <Img
            src={staticFile(image)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: `blur(${blur}px) brightness(0.55) saturate(1.2)`,
              transform: `scale(${drift})`,
            }}
          />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
