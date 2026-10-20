import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Feature, ProjectType } from "../../shared/types";
import { FONT_MONO, FONT_SANS } from "../theme";

export interface GeneratedUIProps {
  name: string;
  tagline: string;
  projectType: ProjectType;
  features: Feature[];
  accent: string;
  accent2: string;
  /** Feature to highlight: -1 hook, 0..n-1 feature scenes, n outro. */
  sceneIndex: number;
}

/** Design size; the component is scaled to whatever phone screen it is placed in. */
export const UI_WIDTH = 390;
export const UI_HEIGHT = 844;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const useEnter = (index: number, delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay - index * 5, fps, config: { damping: 14, stiffness: 120 } });
};

const StatusBar: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 26px 6px", fontSize: 14, fontWeight: 700, color: dark ? "#fff" : "#0f172a" }}>
    <span>9:41</span>
    <span style={{ letterSpacing: 2 }}>●●● ▮</span>
  </div>
);

const Header: React.FC<GeneratedUIProps & { dark?: boolean }> = ({ name, tagline, accent, accent2, dark }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 14px" }}>
    <div style={{ width: 42, height: 42, borderRadius: 13, background: `linear-gradient(135deg, ${accent2}, ${accent})`, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 17 }}>
      {initials(name)}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: dark ? "#fff" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      <div style={{ fontSize: 12, color: dark ? "rgba(255,255,255,0.6)" : "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 270 }}>{tagline}</div>
    </div>
  </div>
);

const CountUp: React.FC<{ to: number; suffix?: string; prefix?: string; delay?: number }> = ({ to, suffix = "", prefix = "", delay = 0 }) => {
  const frame = useCurrentFrame();
  const v = Math.round(interpolate(frame, [delay, delay + 40], [0, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <>
      {prefix}
      {v.toLocaleString("en-US")}
      {suffix}
    </>
  );
};

const FeatureRow: React.FC<{ f: Feature; i: number; active: boolean; accent: string; dark?: boolean }> = ({ f, i, active, accent, dark }) => {
  const p = useEnter(i, 18);
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: 14,
        borderRadius: 16,
        background: dark ? "rgba(255,255,255,0.06)" : "#fff",
        border: `2px solid ${active ? accent : dark ? "rgba(255,255,255,0.1)" : "#e2e8f0"}`,
        boxShadow: active ? `0 10px 30px ${accent}44` : "0 2px 6px rgba(15,23,42,0.05)",
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 30}px) scale(${active ? 1.02 : 1})`,
      }}
    >
      <div style={{ flex: "none", width: 30, height: 30, borderRadius: 10, background: accent, color: "#0b0d1a", display: "grid", placeItems: "center", fontWeight: 900 }}>✓</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15, color: dark ? "#fff" : "#0f172a" }}>{f.title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.35, color: dark ? "rgba(255,255,255,0.65)" : "#64748b", marginTop: 2 }}>{f.description}</div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<GeneratedUIProps> = (p) => {
  const seed = hash(p.name);
  const kpis = [
    { label: "Active", value: 1200 + (seed % 800), suffix: "" },
    { label: "Growth", value: 12 + (seed % 30), suffix: "%", prefix: "+" },
    { label: "Saved", value: 18 + (seed % 40), suffix: "h" },
  ];
  const bars = Array.from({ length: 12 }, (_, i) => 28 + ((seed >> i) % 55) + i * 3);
  return (
    <div style={{ background: "#f1f5f9", height: "100%" }}>
      <StatusBar />
      <Header {...p} />
      <div style={{ display: "flex", gap: 10, padding: "0 20px" }}>
        {kpis.map((k, i) => {
          const e = useEnter(i);
          return (
            <div key={k.label} style={{ flex: 1, background: "#fff", borderRadius: 16, padding: "12px 12px", boxShadow: "0 2px 6px rgba(15,23,42,0.06)", transform: `scale(${0.8 + 0.2 * e})`, opacity: e }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: "#0f172a" }}>
                <CountUp to={k.value} suffix={k.suffix} prefix={k.prefix} delay={i * 6} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ margin: "14px 20px", background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 2px 6px rgba(15,23,42,0.06)" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 10 }}>Overview</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
          {bars.map((h, i) => {
            const g = useEnter(i, 4);
            return <div key={i} style={{ flex: 1, height: h * g, borderRadius: 6, background: i === bars.length - 1 ? p.accent : `linear-gradient(180deg, ${p.accent2}, ${p.accent2}88)` }} />;
          })}
        </div>
      </div>
      <div style={{ padding: "0 20px", display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>Highlights</div>
        {p.features.map((f, i) => (
          <FeatureRow key={f.title} f={f} i={i} active={p.sceneIndex === i} accent={p.accent} />
        ))}
      </div>
    </div>
  );
};

const FeedApp: React.FC<GeneratedUIProps> = (p) => (
  <div style={{ background: "#fff", height: "100%" }}>
    <StatusBar />
    <Header {...p} />
    <div style={{ padding: "0 20px", display: "grid", gap: 14 }}>
      {p.features.map((f, i) => {
        const e = useEnter(i);
        const active = p.sceneIndex === i;
        return (
          <div key={f.title} style={{ borderRadius: 22, overflow: "hidden", background: "#f8fafc", border: `2px solid ${active ? p.accent : "#e2e8f0"}`, transform: `translateY(${(1 - e) * 40}px)`, opacity: e }}>
            <div style={{ height: 120, background: `linear-gradient(${120 + i * 40}deg, ${p.accent2}, ${p.accent})`, display: "grid", placeItems: "center", color: "#fff", fontSize: 40, fontWeight: 900 }}>{i + 1}</div>
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 3, lineHeight: 1.35 }}>{f.description}</div>
            </div>
          </div>
        );
      })}
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 74, background: "#fff", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-around", alignItems: "center" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ width: 26, height: 26, borderRadius: 9, background: i === 0 ? p.accent2 : "#cbd5e1" }} />
      ))}
    </div>
  </div>
);

const GameHud: React.FC<GeneratedUIProps> = (p) => {
  const frame = useCurrentFrame();
  const seed = hash(p.name);
  const level = interpolate(frame, [0, 90], [8, 78], { extrapolateRight: "clamp" });
  const pulse = 1 + Math.sin(frame / 5) * 0.04;
  return (
    <div style={{ background: "linear-gradient(180deg, #0b0d1a, #1b1040)", height: "100%", fontFamily: FONT_MONO, color: "#fff" }}>
      <StatusBar dark />
      <Header {...p} dark />
      <div style={{ margin: "0 20px", padding: 16, border: `3px solid ${p.accent}`, boxShadow: `6px 6px 0 ${p.accent2}`, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>SCORE</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: p.accent }}>
          <CountUp to={12000 + (seed % 90000)} />
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>LEVEL {1 + (seed % 9)}</div>
        <div style={{ height: 14, background: "rgba(255,255,255,0.12)", marginTop: 4 }}>
          <div style={{ width: `${level}%`, height: "100%", background: `repeating-linear-gradient(90deg, ${p.accent} 0 10px, ${p.accent2} 10px 14px)` }} />
        </div>
      </div>
      <div style={{ padding: "16px 20px 0", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: p.accent }}>TOP PLAYERS</div>
        {p.features.map((f, i) => (
          <FeatureRow key={f.title} f={f} i={i} active={p.sceneIndex === i} accent={p.accent} dark />
        ))}
      </div>
      <div style={{ margin: "20px 20px 0", textAlign: "center", padding: "16px 0", background: p.accent, color: "#0b0d1a", fontWeight: 900, fontSize: 22, boxShadow: `6px 6px 0 ${p.accent2}`, transform: `scale(${pulse})` }}>
        ▶ PLAY
      </div>
    </div>
  );
};

/**
 * Step 3 of the media pipeline: when no screenshot or recording exists, build a believable app UI
 * from the README features (dashboard for SaaS, feed for mobile apps, HUD for games) and slowly scroll it.
 */
export const DynamicGeneratedUI: React.FC<GeneratedUIProps & { width: number; height: number }> = ({ width, height, ...p }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = Math.max(width / UI_WIDTH, height / UI_HEIGHT);
  const scroll = interpolate(frame, [0, durationInFrames], [0, 70], { extrapolateRight: "clamp" });
  const Body = p.projectType === "game" ? GameHud : p.projectType === "mobile-app" ? FeedApp : Dashboard;
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", textTransform: "none", letterSpacing: 0, fontFamily: p.projectType === "game" ? FONT_MONO : FONT_SANS }}>
      <div style={{ width: UI_WIDTH, height: UI_HEIGHT + 200, transformOrigin: "top left", transform: `scale(${scale}) translateY(${-scroll}px)`, position: "relative" }}>
        <Body {...p} />
      </div>
    </div>
  );
};
