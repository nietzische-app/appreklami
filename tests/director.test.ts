import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTheme, directStoryboards, heuristicTheme, randomScenes } from "../src/analyzer/director";
import { sanitizeIntent } from "../src/analyzer/intent";
import { buildVideoProps } from "../src/server/pipeline";
import { sanitizeSceneList } from "../src/shared/scenes";
import { TIERS } from "../src/shared/tiers";
import type { ProjectAnalysis, Storyboard } from "../src/shared/types";

const story = (title: string): Storyboard => ({
  id: "story-1",
  angle: "Angle",
  hook: "A hook",
  features: [
    { title, description: "overlay copy" },
    { title: "Second", description: "more overlay" },
    { title: "Third", description: "rest" },
  ],
  outro: "Outro",
  cta: "Go",
});

test("theme: the wizard wins, then the model, then the heuristic", () => {
  assert.equal(heuristicTheme("game"), "arcade");
  assert.equal(heuristicTheme("saas-web"), "saas");
  assert.equal(heuristicTheme("saas-web", { targetAudience: "viral" }), "action");
  assert.equal(heuristicTheme("mobile-app"), "action");
  assert.deepEqual(chooseTheme({ projectType: "game", intent: { theme: "saas" }, llmTheme: "arcade" }), { theme: "saas", source: "user" });
  assert.deepEqual(chooseTheme({ projectType: "game", llmTheme: "action" }), { theme: "action", source: "ai" });
  assert.deepEqual(chooseTheme({ projectType: "saas-web" }), { theme: "saas", source: "auto" });
});

test("scene directions are seeded, valid and neighbours differ", () => {
  const a = randomScenes("Cal.com");
  const b = randomScenes("Cal.com");
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, randomScenes("Other"));
  for (let i = 1; i < a.length; i++) {
    assert.notEqual(a[i].textPosition, a[i - 1].textPosition);
    assert.notEqual(a[i].enterFrom, a[i - 1].enterFrom);
    assert.ok(a[i].zoom.scale >= 1 && a[i].zoom.scale <= 1.5);
  }
  const cleaned = sanitizeSceneList([{ textPosition: "SIDEWAYS", enterFrom: "left", zoom: { x: 999, y: -4, scale: 9 } }, { textPosition: "top" }]);
  assert.equal(cleaned[0].textPosition, "bottom");
  assert.equal(cleaned[0].enterFrom, "left");
  assert.equal(cleaned[0].zoom.x, 100);
  assert.equal(cleaned[0].zoom.y, 0);
  assert.equal(cleaned[0].zoom.scale, 1.5);
  assert.equal(cleaned[1].textPosition, "top");
  assert.equal(directStoryboards([story("X")], "Cal")[0].scenes?.length, 5);
});

test("wizard text stays in the overlay; the phone only gets repo content", () => {
  const analysis = {
    name: "Cal",
    tagline: "Scheduling from the README",
    projectType: "saas-web",
    confidence: 1,
    readmeExcerpt: "",
    media: [],
    mediaOrigin: "generated-ui",
    mediaNotes: [],
    readmeFeatures: [],
    screen: { tagline: "Scheduling from the README", features: [{ title: "Availability", description: "from the repo" }] },
    storyboards: [story("Wizard feature"), story("Wizard feature"), story("Wizard feature")],
    copySource: "template",
    theme: "saas",
    themeSource: "user",
  } as ProjectAnalysis;
  const props = buildVideoProps(analysis, TIERS[0], [], 0);
  assert.equal(props.features[0].title, "Wizard feature");
  assert.equal(props.hook, "A hook");
  assert.equal(props.screen.features[0].title, "Availability");
  assert.equal(props.screen.tagline, "Scheduling from the README");
  assert.equal(props.theme, "saas");
  assert.equal(props.scenes.length, 5);
  assert.equal(JSON.stringify(props.screen).includes("Wizard"), false);
});

test("intent sanitizing accepts a theme and drops anything else", () => {
  assert.equal(sanitizeIntent({ theme: "Arcade" })?.theme, "arcade");
  assert.equal(sanitizeIntent({ theme: "neon" }), undefined);
  assert.equal(sanitizeIntent({ theme: "action", projectDescription: "Books meetings." })?.theme, "action");
});
