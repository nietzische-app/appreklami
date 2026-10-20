import React from "react";
import { Img, staticFile } from "remotion";

interface Props {
  image?: string;
  name: string;
  accent: string;
  accent2: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  radius?: number;
}

/** A rounded "device" card with the project screenshot, or a branded emblem when no image exists. */
export const ImageCard: React.FC<Props> = ({ image, name, accent, accent2, width = 640, height = 1000, style, radius = 56 }) => {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
        background: "#0b0d1a",
        border: "6px solid rgba(255,255,255,0.18)",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {image ? (
        <Img src={staticFile(image)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${accent2}, ${accent})`,
            color: "#fff",
            fontSize: 220,
            fontWeight: 900,
            letterSpacing: -6,
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
};
