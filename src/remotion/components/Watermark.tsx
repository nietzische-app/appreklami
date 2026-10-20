import React from "react";
import { AbsoluteFill } from "remotion";

export const Watermark: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
    <div
      style={{
        marginBottom: 60,
        padding: "14px 34px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "sans-serif",
        fontSize: 34,
        fontWeight: 700,
        letterSpacing: 1,
      }}
    >
      Made with AppReklami - upgrade to remove
    </div>
  </AbsoluteFill>
);
