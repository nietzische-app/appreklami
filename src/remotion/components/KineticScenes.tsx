import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoProps } from "../../shared/types";
import { FONT_MONO, FONT_SANS, fitFont } from "../theme";
import { HOOK, OUTRO, featureScene } from "../timeline";
import { Background } from "./Background";
import { Fade } from "./Fade";
import { ImageCard } from "./ImageCard";
import { Sfx } from "./Sfx";
import { WordReveal } from "./WordReveal";

export type Variant = "arcade" | "pro";

interface Props extends VideoProps {
  variant: Variant;
}

const useStyle = (variant: Variant, accent: string, accent2: string) => ({
  font: variant === "arcade" ? FONT_MONO : FONT_SANS,
  transform: variant === "arcade" ? ("uppercase" as const) : ("none" as const),
  headline: {
    color: "#fff",
    fontWeight: 900,
    lineHeight: 1.08,
    textAlign: "center" as const,
    letterSpacing: variant === "arcade" ? 2 : -2,
    textShadow: variant === "arcade" ? `6px 6px 0 ${accent2}, 12px 12px 0 rgba(0,0,0,0.35)` : `0 10px 40px rgba(0,0,0,0.6), 0 0 60px ${accent}55`,
  },
});

const Card: React.FC<
  VideoProps & { image?: string; enterFrom: "left" | "right" | "bottom"; width: number; height: number; tilt?: number }
> = ({ image, enterFrom, width, height, tilt = 6, ...p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 120, mass: 0.8 } });
  const dir = enterFrom === "left" ? -1 : 1;
  const x = enterFrom === "bottom" ? 0 : (1 - enter) * 900 * dir;
  const y = enterFrom === "bottom" ? (1 - enter) * 1200 : Math.sin(frame / 14) * 14;
  const rotate = (1 - enter) * 18 * dir + Math.sin(frame / 25) * 1.2 + tilt * dir * -0.4;
  return (
    <div style={{ transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)` }}>
      <ImageCard image={image} name={p.projectName} accent={p.accent} accent2={p.accent2} width={width} height={height} />
    </div>
  );
};

/** Shared kinetic-typography timeline used by the Dynamic (arcade) and PRO tiers. */
export const KineticScenes: React.FC<Props> = ({ variant, ...p }) => {
  const st = useStyle(variant, p.accent, p.accent2);
  const img = (i: number) => (p.images.length ? p.images[i % p.images.length] : undefined);
  const arcade = variant === "arcade";
  const hookWords = p.hook.split(/\s+/).filter(Boolean).slice(0, 8);

  return (
    <AbsoluteFill style={{ fontFamily: st.font, background: "#05060f", textTransform: st.transform }}>
      <Sequence from={HOOK.from} durationInFrames={HOOK.duration}>
        <Background image={img(0)} accent={p.accent} accent2={p.accent2} animated blur={arcade ? 30 : 50} />
        <Fade inFrames={4} outFrames={6}>
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 130 }}>
            <Card {...p} image={img(0)} enterFrom="bottom" width={600} height={940} />
          </AbsoluteFill>
          <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 70px 260px" }}>
            <WordReveal text={p.hook} delay={6} stagger={5} style={{ ...st.headline, fontSize: fitFont(p.hook, 108, 62) }} />
          </AbsoluteFill>
        </Fade>
      </Sequence>

      {p.features.map((f, i) => {
        const s = featureScene(i);
        return (
          <Sequence key={f.title} from={s.from} durationInFrames={s.duration}>
            <Background image={img(i + 1)} accent={p.accent} accent2={p.accent2} animated blur={arcade ? 30 : 50} />
            <Fade inFrames={3} outFrames={5}>
              <AbsoluteFill style={{ alignItems: i % 2 ? "flex-start" : "flex-end", paddingTop: 110, paddingLeft: 40, paddingRight: 40 }}>
                <Card {...p} image={img(i + 1)} enterFrom={i % 2 ? "left" : "right"} width={560} height={880} />
              </AbsoluteFill>
              <FeatureText index={i} total={p.features.length} title={f.title} description={f.description} accent={p.accent} headline={st.headline} arcade={arcade} />
            </Fade>
          </Sequence>
        );
      })}

      <Sequence from={OUTRO.from} durationInFrames={OUTRO.duration}>
        <Background image={img(0)} accent={p.accent} accent2={p.accent2} animated blur={60} />
        <Fade inFrames={3} outFrames={1}>
          <Outro {...p} headline={st.headline} arcade={arcade} />
        </Fade>
      </Sequence>

      {arcade ? <ArcadeSfx words={hookWords.length} features={p.features.length} /> : null}
    </AbsoluteFill>
  );
};

const FeatureText: React.FC<{
  index: number;
  total: number;
  title: string;
  description: string;
  accent: string;
  headline: React.CSSProperties;
  arcade: boolean;
}> = ({ index, total, title, description, accent, headline, arcade }) => {
  const frame = useCurrentFrame();
  const descIn = interpolate(frame, [18, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 70px 240px", gap: 26 }}>
      <div style={{ display: "flex", gap: 16 }}>
        {Array.from({ length: total }).map((_, k) => (
          <div
            key={k}
            style={{
              width: arcade ? 44 : 70,
              height: arcade ? 44 : 12,
              borderRadius: arcade ? 0 : 99,
              background: k <= index ? accent : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </div>
      <WordReveal text={title} delay={2} stagger={4} style={{ ...headline, fontSize: fitFont(title, 96, 60) }} />
      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 46, textAlign: "center", lineHeight: 1.3, opacity: descIn, transform: `translateY(${(1 - descIn) * 30}px)`, textTransform: "none" }}>
        {description}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<VideoProps & { headline: React.CSSProperties; arcade: boolean }> = ({ headline, arcade, ...p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 24, fps, config: { damping: 8, stiffness: 140 } });
  const pulse = 1 + Math.sin(frame / 5) * 0.04;
  const blinkOn = !arcade || Math.floor(frame / 8) % 2 === 0;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 70px", gap: 60 }}>
      <WordReveal text={p.outro} delay={2} stagger={5} style={{ ...headline, fontSize: fitFont(p.outro, 118, 70) }} />
      <div
        style={{
          transform: `scale(${pop * pulse})`,
          background: p.accent,
          color: "#0b0d1a",
          fontSize: 58,
          fontWeight: 900,
          padding: "30px 70px",
          borderRadius: arcade ? 0 : 999,
          boxShadow: arcade ? `10px 10px 0 ${p.accent2}` : `0 20px 60px ${p.accent}88`,
          opacity: blinkOn ? 1 : 0.55,
        }}
      >
        {p.cta}
      </div>
      <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 44, textTransform: "none" }}>{p.projectName}</div>
    </AbsoluteFill>
  );
};

const ArcadeSfx: React.FC<{ words: number; features: number }> = ({ words, features }) => (
  <>
    {Array.from({ length: words }).map((_, i) => (
      <Sfx key={`w${i}`} src="sfx/arcade-blip.wav" at={HOOK.from + 6 + i * 5} volume={0.35} />
    ))}
    {Array.from({ length: features }).map((_, i) => (
      <React.Fragment key={`f${i}`}>
        <Sfx src="sfx/arcade-coin.wav" at={featureScene(i).from + 2} volume={0.55} />
        <Sfx src="sfx/arcade-blip.wav" at={featureScene(i).from + 18} volume={0.3} />
      </React.Fragment>
    ))}
    <Sfx src="sfx/arcade-powerup.wav" at={OUTRO.from + 2} volume={0.6} />
  </>
);
