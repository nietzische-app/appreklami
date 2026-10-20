import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { VideoProps } from "../../shared/types";
import { DynamicCamera, ScreenShake, decay } from "../components/Camera";
import { KineticScenes } from "../components/KineticScenes";
import { Sfx } from "../components/Sfx";
import { Watermark } from "../components/Watermark";
import { HOOK, OUTRO, featureScene } from "../timeline";

/** Scene cuts are the "hits": each one punches the camera in and shakes the screen. */
export const PRO_BEATS = [HOOK.from + 2, featureScene(0).from, featureScene(1).from, featureScene(2).from, OUTRO.from];

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
      {PRO_BEATS.map((b) => (
        <Sfx key={b} src="sfx/impact.wav" at={b} volume={0.8} />
      ))}
      <Sfx src="sfx/riser.wav" at={0} volume={0.45} />
      <Sfx src="sfx/shimmer.wav" at={OUTRO.from + 20} volume={0.5} />
    </AbsoluteFill>
  );
};
