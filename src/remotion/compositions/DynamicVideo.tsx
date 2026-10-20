import React from "react";
import { AbsoluteFill } from "remotion";
import type { VideoProps } from "../../shared/types";
import { KineticScenes } from "../components/KineticScenes";
import { Watermark } from "../components/Watermark";

const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 5px)",
      mixBlendMode: "multiply",
    }}
  />
);

/** Option 2: kinetic text with spring animations and 8-bit/arcade sound effects. */
export const DynamicVideo: React.FC<VideoProps> = (p) => (
  <AbsoluteFill>
    <KineticScenes {...p} variant="arcade" />
    <Scanlines />
    {p.watermark ? <Watermark /> : null}
  </AbsoluteFill>
);
