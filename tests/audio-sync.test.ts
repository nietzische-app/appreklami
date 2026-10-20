import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { SFX } from "../src/remotion/sfx-manifest";
import { CTA_PEAK, WORD_PEAK, arcadeSfxEvents, basicSfxEvents, ctaHit, featureTitleHit, hookWordHit, proSfxEvents, PRO_BEATS } from "../src/remotion/sync";
import { FEATURE_DURATION, FEATURES_FROM, HOOK, OUTRO, featureScene } from "../src/remotion/timeline";
import { DURATION_FRAMES } from "../src/shared/video";

const allEvents = [...basicSfxEvents(3), ...arcadeSfxEvents(8, 3), ...proSfxEvents()];

test("every sound exists, is 48 kHz mono and its hit is on a whole frame", () => {
  for (const [name, meta] of Object.entries(SFX)) {
    assert.ok(existsSync(`assets/sfx/${name}.wav`), name);
    const header = readFileSync(`assets/sfx/${name}.wav`).subarray(0, 44);
    assert.equal(header.readUInt32LE(24), 48000, `${name} sample rate`);
    assert.equal(header.readUInt16LE(22), 1, `${name} channels`);
    assert.ok(Number.isInteger(meta.hitFrames) && meta.hitFrames >= 0);
  }
});

test("spring peak-velocity frames are computed, not defaulted", () => {
  assert.ok(WORD_PEAK >= 1 && WORD_PEAK <= 8, `WORD_PEAK=${WORD_PEAK}`);
  assert.ok(CTA_PEAK >= 1 && CTA_PEAK <= 10, `CTA_PEAK=${CTA_PEAK}`);
});

test("no sound starts before frame 0 or runs past a scene it belongs to unexpectedly", () => {
  for (const e of allEvents) {
    assert.ok(e.hit - SFX[e.name].hitFrames >= 0, `${e.name}@${e.hit} would need trimming`);
    assert.ok(e.hit < DURATION_FRAMES, `${e.name}@${e.hit} is outside the video`);
  }
});

test("hits are tied to the visual timing", () => {
  assert.equal(hookWordHit(0), HOOK.from + 6 + WORD_PEAK);
  assert.equal(featureTitleHit(1), featureScene(1).from + 2 + WORD_PEAK);
  assert.equal(ctaHit(), OUTRO.from + 24 + CTA_PEAK);
  assert.deepEqual(PRO_BEATS.slice(1, 4), [FEATURES_FROM, FEATURES_FROM + FEATURE_DURATION, FEATURES_FROM + 2 * FEATURE_DURATION]);
  const impacts = proSfxEvents().filter((e) => e.name === "impact").map((e) => e.hit);
  assert.deepEqual(impacts, PRO_BEATS);
  const whooshes = basicSfxEvents(3).filter((e) => e.name === "soft-whoosh");
  assert.equal(whooshes.length, 3);
  whooshes.forEach((w, i) => assert.ok(w.hit > featureScene(i).from && w.hit < featureScene(i).from + 10));
});
