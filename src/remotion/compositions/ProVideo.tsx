import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { VideoProps } from "../../shared/types";
import { DynamicCamera, ScreenShake, decay } from "../components/Camera";
import { KineticScenes } from "../components/KineticScenes";
import { SfxTrack } from "../components/Sfx";
import { Watermark } from "../components/Watermark";
import { PRO_BEATS, proSfxEvents } from "../sync";

const Vignette: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = decay(frame, PRO_BEATS, 6) * 0.22;
  return (
    <>
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)" }} />
      <AbsoluteFill style={{ pointerEvents: "none", background: "#fff", opacity: flash }} />
    </>
  );
};

/** Option 3 (PRO): camera push-in + punch zoom, screen shake, impact sounds, no watermark, rendered at 2x. */
export const ProVideo: React.FC<VideoProps> = (p) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [525, 540], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: fadeOut }}>
        <ScreenShake beats={PRO_BEATS}>
          <DynamicCamera beats={PRO_BEATS}>
            <KineticScenes {...p} variant="pro" />
          </DynamicCamera>
        </ScreenShake>
        <Vignette />
        {p.watermark ? <Watermark /> : null}
      </AbsoluteFill>
      <SfxTrack events={proSfxEvents()} />
    </AbsoluteFill>
  );
};
