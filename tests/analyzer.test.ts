import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { analyzeProject } from "../src/analyzer";
import { parseGithubUrl } from "../src/analyzer/source";
import { parseReadme } from "../src/analyzer/readme";

const fixture = (name: string) => path.resolve("tests/fixtures", name);

test("detects a game project, README features and screenshots", async () => {
  const a = await analyzeProject(fixture("pixel-quest"));
  assert.equal(a.projectType, "game");
  assert.equal(a.name, "Pixel Quest");
  assert.match(a.tagline, /arcade platformer/i);
  assert.equal(a.readmeFeatures.length, 4);
  assert.ok(a.images.some((p) => p.endsWith("screenshot-gameplay.png")));
  assert.equal(a.storyboards.length, 3);
  for (const s of a.storyboards) {
    assert.ok(s.hook && s.outro && s.cta);
    assert.equal(s.features.length, 3);
  }
  assert.equal(new Set(a.storyboards.map((s) => s.hook)).size, 3, "hooks must differ per video");
});

test("detects a SaaS web project and falls back gracefully without images", async () => {
  const a = await analyzeProject(fixture("taskflow-saas"));
  assert.equal(a.projectType, "saas-web");
  assert.deepEqual(a.images, []);
  assert.equal(a.storyboards.length, 3);
});

test("parseReadme extracts title, tagline, features and relative images only", () => {
  const r = parseReadme("# Hello\n\nA tiny tool.\n\n![a](./img/a.png) ![b](https://x.io/b.png)\n\n## Features\n- One\n- Two things: details\n");
  assert.equal(r.title, "Hello");
  assert.equal(r.tagline, "A tiny tool.");
  assert.deepEqual(r.features, ["One", "Two things: details"]);
  assert.deepEqual(r.imageRefs, ["img/a.png"]);
});

test("only github.com repo URLs are accepted", () => {
  assert.equal(parseGithubUrl("https://github.com/vercel/next.js").repo, "next.js");
  assert.throws(() => parseGithubUrl("https://evil.com/a/b"));
  assert.throws(() => parseGithubUrl("--upload-pack=x"));
  assert.throws(() => parseGithubUrl("file:///etc/passwd"));
});
