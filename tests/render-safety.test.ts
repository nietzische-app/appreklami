import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fetchJsonSafe } from "../src/analyzer/http";
import { normalizeVideoProps } from "../src/remotion/props";
import { blurPreview, degradeMedia, prepareMedia, probeVideo } from "../src/server/media-prep";
import { RenderError, explainRenderError } from "../src/server/renderer";
import type { MediaAsset } from "../src/shared/types";

const video = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  kind: "video",
  src: "media/m1.webm",
  poster: "media/m1-poster.jpg",
  width: 540,
  height: 960,
  durationSec: 2,
  origin: "live-demo",
  ...over,
});

test("explainRenderError maps the OffthreadVideo res.json crash to a media error", () => {
  const raw = "at async getAudioChannelsAndDurationUnlimited (...)\n\nat node_modules/remotion/dist/esm/index.mjs:15555\n15553 │   const json = await res.json();";
  const err = explainRenderError(raw, 1);
  assert.ok(err instanceof RenderError);
  assert.equal(err.kind, "media");
  assert.ok(!err.message.includes("res.json"));
  assert.ok(err.detail.includes("res.json"));
});

test("explainRenderError recognises memory kills and unknown failures", () => {
  assert.equal(explainRenderError("", 137).kind, "memory");
  const unknown = explainRenderError("something odd happened", 1);
  assert.equal(unknown.kind, "unknown");
  assert.ok(unknown.message.includes("exit code 1"));
});

test("normalizeVideoProps fills missing and malformed props", () => {
  const p = normalizeVideoProps({ projectType: "nope", hook: "  ", features: [{ title: "Only one" }, 5], media: [{ kind: "video" }, { src: "media/a.png", width: -1 }], accent: "red" });
  assert.equal(p.projectType, "saas-web");
  assert.ok(p.hook.length > 0);
  assert.equal(p.features.length, 3);
  assert.equal(p.features[0].title, "Only one");
  assert.equal(p.media.length, 1);
  assert.equal(p.media[0].kind, "image");
  assert.equal(p.media[0].width, 1080);
  assert.match(p.accent, /^#/);
  assert.equal(normalizeVideoProps(undefined).features.length, 3);
});

test("degradeMedia: videos -> posters -> nothing", () => {
  const items = [video(), { kind: "image", src: "media/m2.png", width: 100, height: 200, origin: "repo-asset" } as MediaAsset, video({ poster: undefined })];
  assert.equal(degradeMedia(items, 0), items);
  const l1 = degradeMedia(items, 1);
  assert.deepEqual(l1.map((m) => [m.kind, m.src]), [["image", "media/m1-poster.jpg"], ["image", "media/m2.png"]]);
  assert.deepEqual(degradeMedia(items, 2), []);
});

test("fetchJsonSafe never throws", async () => {
  const f = (impl: () => Promise<Response>) => fetchJsonSafe(impl as unknown as typeof fetch, "http://x", {}, { fallback: true });
  assert.equal((await f(async () => new Response("<html>", { status: 200 }))).error, "response was not valid JSON");
  assert.equal((await f(async () => new Response("no", { status: 502 }))).error, "HTTP 502");
  assert.ok((await f(async () => Promise.reject(new Error("ECONNRESET")))).error?.includes("ECONNRESET"));
  const ok = await f(async () => new Response('{"a":1}', { status: 200 }));
  assert.equal(ok.ok, true);
});

test("prepareMedia: broken video falls back to its poster, missing files are dropped", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "prep-"));
  mkdirSync(path.join(dir, "media"));
  writeFileSync(path.join(dir, "media/m1.webm"), Buffer.alloc(60_000, 7));
  writeFileSync(path.join(dir, "media/m1-poster.jpg"), "jpg");
  const notes: string[] = [];
  const out = await prepareMedia(dir, video(), notes);
  assert.equal(out?.kind, "image");
  assert.equal(out?.src, "media/m1-poster.jpg");
  assert.ok(notes.some((n) => n.includes("not playable")));

  assert.equal(await prepareMedia(dir, video({ src: "media/gone.webm" }), notes), undefined);
  writeFileSync(path.join(dir, "media/m3.webm"), Buffer.alloc(60_000, 7));
  assert.equal(await prepareMedia(dir, video({ src: "media/m3.webm", poster: undefined }), notes), undefined);
});

test("prepareMedia: a real recording is re-encoded to a seekable mp4", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "prep-"));
  mkdirSync(path.join(dir, "media"));
  copyFileSync(path.join(import.meta.dirname, "fixtures/sample.webm"), path.join(dir, "media/m1.webm"));
  const out = await prepareMedia(dir, video(), []);
  assert.equal(out?.kind, "video");
  assert.equal(out?.src, "media/m1.norm.mp4");
  assert.ok(existsSync(path.join(dir, "media/m1.norm.mp4")));
  assert.equal(out?.width, 270);
});

test("blurPreview: output keeps the teaser size and a garbage input yields no preview file", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "blur-"));
  const dest = path.join(dir, "preview.mp4");
  assert.equal(await blurPreview(path.join(import.meta.dirname, "fixtures/sample.webm"), dest, 270, 480), true);
  const info = await probeVideo(dest);
  assert.equal(info?.width, 270);
  assert.equal(info?.height, 480);

  writeFileSync(path.join(dir, "bad.mp4"), Buffer.alloc(5000, 3));
  const bad = path.join(dir, "bad-out.mp4");
  assert.equal(await blurPreview(path.join(dir, "bad.mp4"), bad, 270, 480), false);
  assert.equal(existsSync(bad), false);
});
