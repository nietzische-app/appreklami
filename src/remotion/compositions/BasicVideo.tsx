import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { MediaAsset, VideoProps } from "../../shared/types";
import { Background } from "../components/Background";
import { Fade } from "../components/Fade";
import { PhoneMockup } from "../components/PhoneMockup";
import { Sfx } from "../components/Sfx";
import { Watermark } from "../components/Watermark";
import { FONT_SANS, fitFont } from "../theme";
import { HOOK, OUTRO, featureScene } from "../timeline";

const Title: React.FC<{ children: string; size?: number }> = ({ children, size = 96 }) => (
  <div style={{ color: "#fff", fontSize: fitFont(children, size, 56), fontWeight: 800, lineHeight: 1.1, textAlign: "center", textShadow: "0 6px 30px rgba(0,0,0,0.5)" }}>
    {children}
  </div>
);

/** Option 1: clean vertical layout, blurred backdrop, fade transitions, soft sounds. */
export const BasicVideo: React.FC<VideoProps> = (p) => {
  const mediaAt = (i: number): MediaAsset | undefined => (p.media.length ? p.media[i % p.media.length] : undefined);
  const img = (i: number) => {
    const m = mediaAt(i);
    return m ? (m.kind === "video" ? m.poster : m.src) : undefined;
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT_SANS, background: "#0b0d1a" }}>
      <Sequence from={HOOK.from} durationInFrames={HOOK.duration}>
        <Background image={img(0)} accent={p.accent} accent2={p.accent2} />
        <Fade>
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
            <PhoneMockup media={mediaAt(0)} project={p} sceneIndex={-1} videoOffsetFrames={HOOK.from} width={620} height={980} />
          </AbsoluteFill>
          <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 80px 300px" }}>
            <Title>{p.hook}</Title>
          </AbsoluteFill>
        </Fade>
      </Sequence>

      {p.features.map((f, i) => {
        const s = featureScene(i);
        return (
          <Sequence key={f.title} from={s.from} durationInFrames={s.duration}>
            <Background image={img(i)} accent={p.accent} accent2={p.accent2} />
            <Fade>
              <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
                <PhoneMockup media={mediaAt(i)} project={p} sceneIndex={i} videoOffsetFrames={s.from} width={620} height={980} />
              </AbsoluteFill>
              <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 80px 250px", gap: 24 }}>
                <div style={{ color: p.accent, fontSize: 40, fontWeight: 700, letterSpacing: 4 }}>{`FEATURE ${i + 1} / ${p.features.length}`}</div>
                <Title size={82}>{f.title}</Title>
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 44, textAlign: "center", lineHeight: 1.3 }}>{f.description}</div>
              </AbsoluteFill>
            </Fade>
          </Sequence>
        );
      })}

      <Sequence from={OUTRO.from} durationInFrames={OUTRO.duration}>
        <Background image={img(0)} accent={p.accent} accent2={p.accent2} blur={55} />
        <Fade inFrames={14} outFrames={1}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px", gap: 56 }}>
            <PhoneMockup media={mediaAt(0)} project={p} sceneIndex={3} videoOffsetFrames={OUTRO.from} width={420} height={660} />
            <Title size={90}>{p.outro}</Title>
            <div style={{ background: p.accent, color: "#0b0d1a", fontSize: 50, fontWeight: 800, padding: "26px 60px", borderRadius: 999 }}>{p.cta}</div>
          </AbsoluteFill>
        </Fade>
      </Sequence>

      <Sfx src="sfx/soft-chime.wav" at={HOOK.from + 4} volume={0.6} />
      {p.features.map((f, i) => (
        <Sfx key={f.title} src="sfx/soft-whoosh.wav" at={featureScene(i).from} volume={0.5} />
      ))}
      <Sfx src="sfx/soft-chime.wav" at={OUTRO.from} volume={0.7} />

      {p.watermark ? <Watermark /> : null}
    </AbsoluteFill>
  );
};
