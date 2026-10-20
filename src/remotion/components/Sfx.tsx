import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { SFX, type SfxName } from "../sfx-manifest";
import type { SfxEvent } from "../sync";

interface Props {
  name: SfxName;
  /** Absolute frame on which the transient (peak) of the sound must land. */
  hit: number;
  volume?: number;
}

/**
 * Frame-accurate sound effect. Each WAV is padded (see scripts/generate-sfx.ts) so its transient sits on a whole frame
 * (`hitFrames`); the sequence starts that many frames before `hit`, so the transient lands exactly on `hit`.
 * If that start would be before frame 0 the lead-in is trimmed with `startFrom` instead of delaying the sound.
 */
export const Sfx: React.FC<Props> = ({ name, hit, volume = 0.7 }) => {
  const { fps } = useVideoConfig();
  const meta = SFX[name];
  const start = hit - meta.hitFrames;
  const trim = Math.max(0, -start);
  return (
    <Sequence from={Math.max(0, start)} layout="none" durationInFrames={Math.ceil(meta.durationSec * fps) + 2}>
      <Audio src={staticFile(meta.file)} volume={volume} startFrom={trim} />
    </Sequence>
  );
};

export const SfxTrack: React.FC<{ events: SfxEvent[] }> = ({ events }) => (
  <>
    {events.map((e, i) => (
      <Sfx key={`${e.name}-${e.hit}-${i}`} name={e.name} hit={e.hit} volume={e.volume} />
    ))}
  </>
);
