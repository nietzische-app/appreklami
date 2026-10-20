import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { analyzeProject } from "../src/analyzer";
import { parseGithubUrl } from "../src/analyzer/source";
import { pickImages } from "../src/analyzer/images";
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

test("shell comments inside code fences are not mistaken for the project title", () => {
  const md = "<h1 align=\"center\">Snapkit</h1>\n\nFast photo batch tool.\n\n```bash\n# In a terminal just run:\nnpx snapkit\n```\n\n## Smart cropping\n\nFinds the subject and crops automatically. More text.\n\n## Installation\n\nRun it.\n";
  const r = parseReadme(md);
  assert.equal(r.title, "Snapkit");
  assert.equal(r.tagline, "Fast photo batch tool.");
  assert.deepEqual(r.sections.map((s) => s.title), ["Smart cropping"]);

  const noH1 = parseReadme("```sh\n# In a terminal just run:\nmake\n```\n\nSomething useful.\n");
  assert.equal(noH1.title, undefined);
});

test("images: only README-referenced or screenshot-named files; sample/test photos are ignored", () => {
  const f = (rel: string) => ({ abs: `/r/${rel}`, rel, size: 200_000 });
  const files = [
    f("docs/screenshot-dashboard.png"),
    f("images/ui.png"),
    f("samples/mountains.jpg"),
    f("examples/beach.jpg"),
    f("assets/random-photo.jpg"),
    f("assets/logo.png"),
    f("test/fixtures/lake.png"),
  ];
  const picked = pickImages(files, ["images/ui.png", "assets/logo.png"]).map((p) => p.replace("/r/", ""));
  assert.deepEqual(picked.sort(), ["docs/screenshot-dashboard.png", "images/ui.png"]);
  assert.deepEqual(pickImages([f("assets/random-photo.jpg")], []), []);
});
