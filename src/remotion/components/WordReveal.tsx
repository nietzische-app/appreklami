import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { WORD_SPRING, WORD_SPRING_SOFT } from "../sync";

interface Props {
  text: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
  /** Pop-in with overshoot (arcade/pro) vs. gentle rise. */
  bouncy?: boolean;
}

export const WordReveal: React.FC<Props> = ({ text, delay = 0, stagger = 4, style, bouncy = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 0.28em", ...style }}>
      {words.map((word, i) => {
        const p = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: bouncy ? WORD_SPRING : WORD_SPRING_SOFT,
        });
        return (
          <span
            key={`${word}-${i}`}
            style={{
              display: "inline-block",
              opacity: Math.min(1, p * 2),
              transform: `translateY(${(1 - p) * 70}px) scale(${0.6 + 0.4 * p})`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
