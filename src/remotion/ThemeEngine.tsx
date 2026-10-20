import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ThemeId } from "../shared/types";
import { decay } from "./components/Camera";
import { CTA_SPRING } from "./sync";

/**
 * Theme engine: every look-and-feel decision (fonts, colours, backdrop, CRT / glow / speed effects, caption plates,
 * phone frame, CTA button, camera and shake strength) lives here, keyed by ThemeId. The composition never contains
 * theme-specific styling, so adding a theme means adding one entry to THEMES.
 */

export interface ThemeColors {
  bg: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
}

export interface ThemeSpec {
  id: ThemeId;
  label: string;
  fontFamily: string;
  /** Glyph width relative to Inter; scales headline sizes so wide pixel fonts and narrow condensed fonts both fit. */
  sizeScale: number;
  uppercase: boolean;
  /** Peak screen-shake in px and camera push strength; the tier scales these (Basic none, PRO full). */
  motion: { shake: number; camera: number };
  /** Hex pair used by this theme; `null` keeps the project-type palette (SaaS lets the product colour glow). */
  palette: { accent: string; accent2: string } | null;
  colors: Omit<ThemeColors, "accent" | "accent2">;
}

export const THEMES: Record<ThemeId, ThemeSpec> = {
  arcade: {
    id: "arcade",
    label: "Arcade",
    fontFamily: '"Press Start 2P", "Courier New", monospace',
    sizeScale: 0.58,
    uppercase: true,
    motion: { shake: 12, camera: 0.8 },
    palette: { accent: "#00f5d4", accent2: "#ff2e97" },
    colors: { bg: "#0a0420", text: "#ffffff", muted: "rgba(255,255,255,0.78)" },
  },
  saas: {
    id: "saas",
    label: "SaaS",
    fontFamily: '"InterVar", "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    sizeScale: 1,
    uppercase: false,
    motion: { shake: 6, camera: 0.7 },
    palette: null,
    colors: { bg: "#050505", text: "#ffffff", muted: "#a1a1aa" },
  },
  action: {
    id: "action",
    label: "Action",
    fontFamily: '"Anton", Impact, "Arial Narrow", sans-serif',
    sizeScale: 1.32,
    uppercase: true,
    motion: { shake: 34, camera: 1.25 },
    palette: { accent: "#ffd400", accent2: "#ff3b1f" },
    colors: { bg: "#0b0b0f", text: "#ffffff", muted: "rgba(255,255,255,0.88)" },
  },
};

export const themeColors = (theme: ThemeId, project: { accent: string; accent2: string }): ThemeColors => {
  const spec = THEMES[theme];
  return { ...spec.colors, ...(spec.palette ?? project) };
};

/** Per-tier strength of camera and shake: Basic stays calm, Dynamic gets a hint, PRO gets everything. */
export const TIER_MOTION = { basic: { camera: 0, shake: 0 }, dynamic: { camera: 0.35, shake: 0.3 }, pro: { camera: 1, shake: 1 } } as const;

/** Headline size that fits the 1080 px frame for this theme's font metrics. */
export const headlineSize = (theme: ThemeId, text: string, max: number, min: number): number => {
  const scale = THEMES[theme].sizeScale;
  const fitted = max * scale * Math.sqrt(26 / Math.max(text.length, 1));
  return Math.round(Math.max(min * scale, Math.min(max * scale, fitted)));
};

// ---------------------------------------------------------------------------------------------------------------------
// Fonts (bundled in assets/fonts, loaded through staticFile so renders do not depend on system fonts or the network)

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

interface FontFile {
  family: string;
  file: string;
  range: string;
  weight?: string;
}

export const THEME_FONTS: Record<ThemeId, FontFile[]> = {
  arcade: [
    { family: "Press Start 2P", file: "fonts/press-start-2p-latin-400-normal.woff2", range: LATIN },
    { family: "Press Start 2P", file: "fonts/press-start-2p-latin-ext-400-normal.woff2", range: LATIN_EXT },
  ],
  saas: [
    { family: "InterVar", file: "fonts/inter-latin-wght-normal.woff2", range: LATIN, weight: "100 900" },
    { family: "InterVar", file: "fonts/inter-latin-ext-wght-normal.woff2", range: LATIN_EXT, weight: "100 900" },
  ],
  action: [
    { family: "Anton", file: "fonts/anton-latin-400-normal.woff2", range: LATIN },
    { family: "Anton", file: "fonts/anton-latin-ext-400-normal.woff2", range: LATIN_EXT },
  ],
};

/** Holds the render until the theme's font files are in. A missing font only falls back to the system stack. */
export function useThemeFonts(theme: ThemeId): void {
  const [handle] = useState(() => delayRender(`theme fonts: ${theme}`));
  useEffect(() => {
    let done = false;
    const release = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    Promise.allSettled(
      THEME_FONTS[theme].map(async (f) => {
        const face = new FontFace(f.family, `url(${staticFile(f.file)})`, { unicodeRange: f.range, ...(f.weight ? { weight: f.weight } : {}) });
        document.fonts.add(await face.load());
      }),
    ).then(release);
    return release;
  }, [handle, theme]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Backdrop: blurred real media (when there is any) plus the theme's own scenery

interface BackdropProps {
  theme: ThemeId;
  colors: ThemeColors;
  image?: string;
  blur?: number;
  /** Animate the scenery (Dynamic / PRO). */
  animated?: boolean;
}

const ArcadeScenery: React.FC<{ colors: ThemeColors; animated: boolean }> = ({ colors, animated }) => {
  const frame = useCurrentFrame();
  const scroll = animated ? (frame * 1.4) % 80 : 0;
  return (
    <>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 100%, ${colors.accent2}66 0%, transparent 60%), linear-gradient(180deg, #12053a 0%, ${colors.bg} 100%)` }} />
      <AbsoluteFill style={{ top: "58%", perspective: 700, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: "-50%",
            right: "-50%",
            top: 0,
            height: "220%",
            transform: "rotateX(68deg)",
            transformOrigin: "50% 0%",
            backgroundImage: `linear-gradient(${colors.accent}aa 2px, transparent 2px), linear-gradient(90deg, ${colors.accent}aa 2px, transparent 2px)`,
            backgroundSize: "80px 80px",
            backgroundPosition: `0 ${scroll}px`,
            maskImage: "linear-gradient(180deg, transparent 0%, #000 35%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 35%)",
          }}
        />
      </AbsoluteFill>
    </>
  );
};

const SaasScenery: React.FC<{ colors: ThemeColors }> = ({ colors }) => (
  <>
    <AbsoluteFill style={{ background: colors.bg }} />
    <AbsoluteFill
      style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "96px 96px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 25%, #000 20%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 25%, #000 20%, transparent 80%)",
      }}
    />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 40% at 50% 8%, ${colors.accent}40, transparent 70%), radial-gradient(ellipse 60% 30% at 50% 100%, ${colors.accent2}22, transparent 70%)` }} />
  </>
);

const ActionScenery: React.FC<{ colors: ThemeColors; animated: boolean }> = ({ colors, animated }) => {
  const frame = useCurrentFrame();
  const rotate = animated ? frame * 0.5 : 0;
  const slide = animated ? (frame * 14) % 400 : 0;
  return (
    <>
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${colors.bg} 0%, #2a0a06 100%)` }} />
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 3200,
            height: 3200,
            marginLeft: -1600,
            marginTop: -1600,
            transform: `rotate(${rotate}deg)`,
            background: `repeating-conic-gradient(from 0deg, ${colors.accent2}30 0deg 6deg, transparent 6deg 16deg)`,
            maskImage: "radial-gradient(circle, transparent 12%, #000 60%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 12%, #000 60%)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(115deg, transparent 0 140px, ${colors.accent}18 140px 200px)`, backgroundPosition: `${slide}px 0` }} />
    </>
  );
};

export const ThemeBackdrop: React.FC<BackdropProps> = ({ theme, colors, image, blur = 40, animated = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = animated ? interpolate(frame, [0, durationInFrames], [1.25, 1.45]) : 1.3;
  const imageOpacity = theme === "saas" ? 0.28 : theme === "arcade" ? 0.4 : 0.38;
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {theme === "arcade" ? <ArcadeScenery colors={colors} animated={animated} /> : theme === "saas" ? <SaasScenery colors={colors} /> : <ActionScenery colors={colors} animated={animated} />}
      {image ? (
        <AbsoluteFill style={{ overflow: "hidden", opacity: imageOpacity, mixBlendMode: theme === "saas" ? "screen" : "normal" }}>
          <Img src={staticFile(image)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: `blur(${blur}px) brightness(0.7) saturate(1.2)`, transform: `scale(${drift})` }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.5) 100%)" }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// Global overlay: CRT for Arcade, soft vignette for SaaS, vignette + beat flash for Action

export const ThemeOverlay: React.FC<{ theme: ThemeId; colors: ThemeColors; beats: number[]; intense: boolean }> = ({ theme, colors, beats, intense }) => {
  const frame = useCurrentFrame();
  if (theme === "arcade") {
    const flicker = 0.035 * random(`crt-${frame}`);
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, transparent 2px, transparent 5px)", mixBlendMode: "multiply" }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.72) 100%)" }} />
        <AbsoluteFill style={{ background: `linear-gradient(90deg, ${colors.accent2}14, transparent 12%, transparent 88%, ${colors.accent}14)` }} />
        <AbsoluteFill style={{ background: "#fff", opacity: flicker }} />
      </AbsoluteFill>
    );
  }
  if (theme === "action") {
    const flash = intense ? decay(frame, beats, 6) * 0.3 : 0;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.65) 100%)" }} />
        <AbsoluteFill style={{ background: colors.accent, opacity: flash, mixBlendMode: "screen" }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)" }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// Typography and plates

/** Headline text style for this theme (apply `wordStyle` per word so gradient text survives the word animation). */
export function headlineStyles(theme: ThemeId, colors: ThemeColors, fontSize: number): { container: React.CSSProperties; word: React.CSSProperties } {
  const spec = THEMES[theme];
  const base: React.CSSProperties = {
    fontFamily: spec.fontFamily,
    fontSize,
    textTransform: spec.uppercase ? "uppercase" : "none",
    textAlign: "center",
    lineHeight: 1.1,
  };
  if (theme === "arcade") {
    return {
      container: { ...base, lineHeight: 1.35, letterSpacing: 2 },
      word: { color: colors.text, textShadow: `4px 4px 0 ${colors.accent2}, 0 0 24px ${colors.accent}, 0 0 48px ${colors.accent}88` },
    };
  }
  if (theme === "action") {
    return {
      container: { ...base, lineHeight: 1.02, letterSpacing: 1, fontStyle: "italic", transform: "skewX(-7deg)" },
      word: { color: colors.text, textShadow: `0 8px 0 ${colors.accent2}, 0 14px 40px rgba(0,0,0,0.7)`, WebkitTextStroke: "2px rgba(0,0,0,0.5)" },
    };
  }
  return {
    container: { ...base, lineHeight: 1.08, letterSpacing: -fontSize * 0.035, fontWeight: 650 },
    word: { backgroundImage: "linear-gradient(180deg, #ffffff 25%, rgba(255,255,255,0.6) 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", paddingBottom: "0.08em" },
  };
}

export const bodyFont = (theme: ThemeId): React.CSSProperties => ({
  fontFamily: theme === "saas" ? THEMES.saas.fontFamily : '"InterVar", "Inter", "Segoe UI", Arial, sans-serif',
});

/** The block behind a caption: glass card (SaaS), hard-edged pixel box (Arcade), slanted bar (Action). */
export const CaptionPlate: React.FC<{ theme: ThemeId; colors: ThemeColors; children: React.ReactNode; style?: React.CSSProperties }> = ({ theme, colors, children, style }) => {
  const common: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 26, boxSizing: "border-box", maxWidth: 960 };
  if (theme === "saas") {
    return (
      <div style={{ ...common, padding: "44px 56px", borderRadius: 48, background: "rgba(255,255,255,0.055)", border: "1.5px solid rgba(255,255,255,0.14)", backdropFilter: "blur(28px)", boxShadow: "0 0 90px -20px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,0.12)", ...style }}>
        {children}
      </div>
    );
  }
  if (theme === "arcade") {
    return (
      <div style={{ ...common, padding: "36px 40px", background: "rgba(10,4,32,0.86)", border: `6px solid ${colors.accent}`, boxShadow: `12px 12px 0 ${colors.accent2}, 0 0 40px ${colors.accent}66`, ...style }}>
        {children}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", ...common, padding: "34px 50px", ...style }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(8,8,12,0.78)", border: `5px solid ${colors.accent}`, transform: "skewX(-7deg)", boxShadow: `14px 14px 0 ${colors.accent2}` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>{children}</div>
    </div>
  );
};

export const FeaturePips: React.FC<{ theme: ThemeId; colors: ThemeColors; index: number; total: number }> = ({ theme, colors, index, total }) => (
  <div style={{ display: "flex", gap: theme === "arcade" ? 14 : 16 }}>
    {Array.from({ length: total }).map((_, k) => (
      <div
        key={k}
        style={{
          width: theme === "arcade" ? 36 : theme === "action" ? 80 : 64,
          height: theme === "arcade" ? 36 : theme === "action" ? 16 : 10,
          borderRadius: theme === "saas" ? 99 : 0,
          transform: theme === "action" ? "skewX(-25deg)" : undefined,
          background: k <= index ? colors.accent : "rgba(255,255,255,0.22)",
          boxShadow: k <= index && theme !== "saas" ? `0 0 18px ${colors.accent}` : undefined,
        }}
      />
    ))}
  </div>
);

export const CtaButton: React.FC<{ theme: ThemeId; colors: ThemeColors; delay: number; animated: boolean; children: string }> = ({ theme, colors, delay, animated, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = animated ? spring({ frame: frame - delay, fps, config: CTA_SPRING }) : 1;
  const pulse = animated ? 1 + Math.sin(frame / 5) * 0.035 : 1;
  const blinkOn = theme !== "arcade" || !animated || Math.floor(frame / 8) % 2 === 0;
  const size = theme === "arcade" ? 36 : 56;
  const base: React.CSSProperties = { fontFamily: THEMES[theme].fontFamily, fontSize: size, textTransform: THEMES[theme].uppercase ? "uppercase" : "none", transform: `scale(${pop * pulse})`, opacity: blinkOn ? 1 : 0.6 };
  if (theme === "arcade") {
    return <div style={{ ...base, background: colors.accent, color: "#0a0420", padding: "28px 44px", boxShadow: `10px 10px 0 ${colors.accent2}`, lineHeight: 1.3, textAlign: "center" }}>{children}</div>;
  }
  if (theme === "action") {
    return (
      <div style={{ ...base, background: colors.accent, color: "#0b0b0f", padding: "22px 64px", transform: `${base.transform} skewX(-10deg)`, boxShadow: `12px 12px 0 ${colors.accent2}`, letterSpacing: 2 }}>
        {children}
      </div>
    );
  }
  return (
    <div style={{ ...base, background: "linear-gradient(180deg, #ffffff, #d4d4d8)", color: "#050505", fontWeight: 650, padding: "26px 64px", borderRadius: 999, boxShadow: "0 0 70px -8px rgba(255,255,255,0.45)", letterSpacing: -1 }}>
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// Phone frame look

export function phoneFrameStyle(theme: ThemeId, colors: ThemeColors): React.CSSProperties & { screenRadius: number; bezel: number } {
  if (theme === "arcade") {
    return { background: "#06020f", border: `8px solid ${colors.accent}`, borderRadius: 36, boxShadow: `14px 14px 0 ${colors.accent2}, 0 0 60px ${colors.accent}77`, screenRadius: 20, bezel: 8 };
  }
  if (theme === "action") {
    return { background: "#050507", border: `7px solid ${colors.accent}`, borderRadius: 54, boxShadow: `16px 16px 0 ${colors.accent2}, 0 40px 90px rgba(0,0,0,0.6)`, screenRadius: 40, bezel: 8 };
  }
  return { background: "#0a0a0a", border: "2px solid rgba(255,255,255,0.18)", borderRadius: 64, boxShadow: "0 0 100px -16px rgba(255,255,255,0.22), 0 40px 90px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.05)", screenRadius: 54, bezel: 10 };
}

/** Easing for the Basic tier's calm slide-in. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
