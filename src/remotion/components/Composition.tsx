import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { EnterFrom, SceneDirection, TextPosition, TierId, VideoProps } from "../../shared/types";
import {
  CaptionPlate,
  CtaButton,
  FeaturePips,
  THEMES,
  ThemeBackdrop,
  ThemeOverlay,
  TIER_MOTION,
  bodyFont,
  easeOut,
  headlineSize,
  headlineStyles,
  themeColors,
  useThemeFonts,
} from "../ThemeEngine";
import { PhoneMockup, type PhoneProject } from "./PhoneMockup";
import { SfxTrack } from "./Sfx";
import { Fade } from "./Fade";
import { Watermark } from "./Watermark";
import { WordReveal } from "./WordReveal";
import { DynamicCamera, ScreenShake } from "./Camera";
import {
  BASIC_FADE_IN,
  FEATURE_DESC_RAMP,
  FEATURE_TITLE_DELAY,
  HOOK_WORD_DELAY,
  HOOK_WORD_STAGGER,
  OUTRO_CTA_DELAY,
  PRO_BEATS,
  sfxEvents,
} from "../sync";
import { HOOK, OUTRO, featureScene } from "../timeline";

/**
 * One composition for all three tiers. The tier only changes motion strength, transition style and which sounds play;
 * the look (Arcade / SaaS / Action) comes from `props.theme` and the staging of each scene from `props.scenes`.
 * Wizard text is rendered here, as captions. It never reaches the phone.
 */

const FLY: Record<EnterFrom, [number, number]> = {
  left: [-1400, 0],
  right: [1400, 0],
  top: [0, -1700],
  bottom: [0, 1700],
};

const phoneBox = (position: TextPosition): { width: number; height: number; padTop: number } =>
  position === "center" ? { width: 520, height: 820, padTop: 150 } : position === "top" ? { width: 540, height: 860, padTop: 430 } : { width: 600, height: 940, padTop: 120 };

export const PromoComposition: React.FC<VideoProps & { tier: TierId }> = (p) => {
  const frame = useCurrentFrame();
  useThemeFonts(p.theme);
  const colors = themeColors(p.theme, p);
  const spec = THEMES[p.theme];
  const motion = TIER_MOTION[p.tier];
  const kinetic = p.tier !== "basic";
  const words = p.hook.split(/\s+/).filter(Boolean);

  const phone: PhoneProject = {
    projectName: p.projectName,
    projectType: p.projectType,
    accent: colors.accent,
    accent2: colors.accent2,
    screen: p.screen,
  };
  const mediaAt = (i: number) => (p.media.length ? p.media[i % p.media.length] : undefined);
  const still = (i: number) => {
    const m = mediaAt(i);
    return m ? (m.kind === "video" ? m.poster : m.src) : undefined;
  };

  const focusAt = (at: number) => {
    const windows = [HOOK, featureScene(0), featureScene(1), featureScene(2), OUTRO];
    const i = windows.findIndex((w, n) => at >= w.from && (n === windows.length - 1 || at < windows[n + 1].from));
    const z = p.scenes[Math.max(0, i)].zoom;
    return { x: z.x, y: z.y };
  };

  const endFade = p.tier === "pro" ? interpolate(frame, [525, 540], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;

  return (
    <ThemeCtx.Provider value={{ id: p.theme, colors }}>
    <AbsoluteFill style={{ background: colors.bg, fontFamily: spec.fontFamily, color: colors.text }}>
      <AbsoluteFill style={{ opacity: endFade }}>
        <ScreenShake beats={PRO_BEATS} intensity={spec.motion.shake * motion.shake}>
          <DynamicCamera beats={PRO_BEATS} strength={spec.motion.camera * motion.camera} focusAt={focusAt}>
            <Scene from={HOOK.from} duration={HOOK.duration} fadeIn={BASIC_FADE_IN.hook} image={still(0)} animated={kinetic}>
              <Stage theme={p.theme} colors={colors} direction={p.scenes[0]} kinetic={kinetic} phone={phone} media={mediaAt(0)} sceneIndex={-1} offset={HOOK.from}>
                <Headline theme={p.theme} colors={colors} text={p.hook} max={108} kinetic={kinetic} delay={HOOK_WORD_DELAY} stagger={HOOK_WORD_STAGGER} />
              </Stage>
            </Scene>

            {p.features.map((f, i) => {
              const s = featureScene(i);
              return (
                <Scene key={f.title} from={s.from} duration={s.duration} fadeIn={BASIC_FADE_IN.feature} image={still(i)} animated={kinetic}>
                  <Stage theme={p.theme} colors={colors} direction={p.scenes[i + 1]} kinetic={kinetic} phone={phone} media={mediaAt(i)} sceneIndex={i} offset={s.from}>
                    <FeaturePips theme={p.theme} colors={colors} index={i} total={p.features.length} />
                    <Headline theme={p.theme} colors={colors} text={f.title} max={92} kinetic={kinetic} delay={FEATURE_TITLE_DELAY} stagger={4} />
                    <Body theme={p.theme} colors={colors} delay={kinetic ? FEATURE_DESC_RAMP[0] : 0}>
                      {f.description}
                    </Body>
                  </Stage>
                </Scene>
              );
            })}

            <Scene from={OUTRO.from} duration={OUTRO.duration} fadeIn={BASIC_FADE_IN.outro} image={still(0)} animated={kinetic}>
              <Stage theme={p.theme} colors={colors} direction={p.scenes[4]} kinetic={kinetic} phone={phone} media={mediaAt(0)} sceneIndex={3} offset={OUTRO.from} phoneScale={0.72}>
                <Headline theme={p.theme} colors={colors} text={p.outro} max={100} kinetic={kinetic} delay={2} stagger={5} />
                <CtaButton theme={p.theme} colors={colors} delay={OUTRO_CTA_DELAY} animated={kinetic}>
                  {p.cta}
                </CtaButton>
                <div style={{ ...bodyFont(p.theme), fontSize: 36, color: colors.muted }}>{p.projectName}</div>
              </Stage>
            </Scene>
          </DynamicCamera>
        </ScreenShake>
        <ThemeOverlay theme={p.theme} colors={colors} beats={PRO_BEATS} intense={p.tier === "pro"} />
        {p.watermark ? <Watermark /> : null}
      </AbsoluteFill>
      <SfxTrack events={sfxEvents(p.theme, p.tier, words.length, p.features.length)} />
    </AbsoluteFill>
    </ThemeCtx.Provider>
  );
};

const Scene: React.FC<{
  from: number;
  duration: number;
  fadeIn: number;
  image?: string;
  animated: boolean;
  children: React.ReactNode;
}> = ({ from, duration, fadeIn, image, animated, children }) => {
  const theme = useThemeFromContext();
  return (
    <Sequence from={from} durationInFrames={duration}>
      <ThemeBackdrop theme={theme.id} colors={theme.colors} image={image} animated={animated} blur={theme.id === "saas" ? 48 : 34} />
      <Fade inFrames={animated ? 4 : fadeIn} outFrames={animated ? 5 : 8}>
        {children}
      </Fade>
    </Sequence>
  );
};

/** Small context so Scene can theme the backdrop without threading every prop. */
const ThemeCtx = React.createContext<{ id: VideoProps["theme"]; colors: ReturnType<typeof themeColors> } | null>(null);
const useThemeFromContext = () => {
  const v = React.useContext(ThemeCtx);
  if (!v) throw new Error("Scene rendered outside PromoComposition");
  return v;
};

const Stage: React.FC<{
  theme: VideoProps["theme"];
  colors: ReturnType<typeof themeColors>;
  direction: SceneDirection;
  kinetic: boolean;
  phone: PhoneProject;
  media: VideoProps["media"][number] | undefined;
  sceneIndex: number;
  offset: number;
  phoneScale?: number;
  children: React.ReactNode;
}> = ({ theme, colors, direction, kinetic, phone, media, sceneIndex, offset, phoneScale = 1, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = kinetic ? spring({ frame, fps, config: { damping: 13, stiffness: 120, mass: 0.7 } }) : easeOut(frame / 16);
  const [dx, dy] = FLY[direction.enterFrom];
  const box = phoneBox(direction.textPosition);
  const captionAt: React.CSSProperties =
    direction.textPosition === "top"
      ? { justifyContent: "flex-start", paddingTop: 130 }
      : direction.textPosition === "center"
        ? { justifyContent: "center" }
        : { justifyContent: "flex-end", paddingBottom: 200 };

  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: box.padTop, opacity: direction.textPosition === "center" ? 0.55 : 1 }}>
        <div style={{ transform: `translate(${(1 - enter) * dx}px, ${(1 - enter) * dy}px) scale(${phoneScale})` }}>
          <PhoneMockup media={media} project={phone} theme={theme} sceneIndex={sceneIndex} videoOffsetFrames={offset} zoom={direction.zoom} width={box.width} height={box.height} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", padding: "0 60px", ...captionAt }}>
        <CaptionPlate theme={theme} colors={colors}>
          {children}
        </CaptionPlate>
      </AbsoluteFill>
    </>
  );
};

const Headline: React.FC<{
  theme: VideoProps["theme"];
  colors: ReturnType<typeof themeColors>;
  text: string;
  max: number;
  kinetic: boolean;
  delay: number;
  stagger: number;
}> = ({ theme, colors, text, max, kinetic, delay, stagger }) => {
  const styles = headlineStyles(theme, colors, headlineSize(theme, text, max, 48));
  if (!kinetic) return <div style={{ ...styles.container, ...styles.word }}>{text}</div>;
  return <WordReveal text={text} delay={delay} stagger={stagger} bouncy={theme !== "saas"} style={styles.container} wordStyle={styles.word} />;
};

const Body: React.FC<{ theme: VideoProps["theme"]; colors: ReturnType<typeof themeColors>; delay: number; children: string }> = ({ theme, colors, delay, children }) => {
  const frame = useCurrentFrame();
  const shown = interpolate(frame, [delay, delay + (FEATURE_DESC_RAMP[1] - FEATURE_DESC_RAMP[0])], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ ...bodyFont(theme), color: colors.muted, fontSize: theme === "arcade" ? 28 : 40, textAlign: "center", lineHeight: 1.35, opacity: shown, transform: `translateY(${(1 - shown) * 24}px)` }}>
      {children}
    </div>
  );
};
