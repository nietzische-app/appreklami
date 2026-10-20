import React from "react";
import { Audio, Sequence, staticFile } from "remotion";

interface Props {
  /** Path relative to the public dir, e.g. "sfx/arcade-coin.wav". */
  src: string;
  at: number;
  volume?: number;
}

export const Sfx: React.FC<Props> = ({ src, at, volume = 0.7 }) => (
  <Sequence from={at} layout="none" durationInFrames={90}>
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);
