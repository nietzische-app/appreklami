import assert from "node:assert/strict";
import { test } from "node:test";
import { computeProgress } from "../src/server/jobStore";
import { createProgressParser } from "../src/server/renderer";
import type { JobState } from "../src/shared/types";

const video = (status: string, progress: number) => ({ status, progress }) as JobState["videos"][number];
const job = (status: JobState["status"], videos: JobState["videos"]) => ({ status, videos }) as JobState;

test("remotion output lines map to a monotonic 0..99 percentage", () => {
  const seen: number[] = [];
  const parse = createProgressParser((p) => seen.push(p));
  parse("Bundled code 100%");
  parse("Rendered 270/540, time remaining: 5s");
  parse("Encoded 100/540");
  parse("Rendered 540/540, time remaining: 0s");
  parse("Encoded 540/540");
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  assert.equal(seen.at(-1), 99);
  assert.ok(seen[0] > 0 && seen[0] < 50);
});

test("overall progress spans analysis + only the videos that will render", () => {
  assert.equal(computeProgress(job("queued", [])), 0);
  const three = [video("pending", 0), video("pending", 0), video("pending", 0)];
  assert.equal(computeProgress(job("analyzing", three)), 0);
  assert.equal(computeProgress(job("rendering", three)), 5);
  assert.equal(computeProgress(job("rendering", [video("completed", 100), video("rendering", 50), video("pending", 0)])), 5 + Math.floor(1.5 * (95 / 3)));
  const free = [video("completed", 100), video("completed", 100), video("skipped", 0)];
  assert.equal(computeProgress(job("rendering", free)), 99);
  assert.equal(computeProgress(job("completed", free)), 100);
});
