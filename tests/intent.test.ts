import assert from "node:assert/strict";
import { test } from "node:test";
import { writeStoryboards, type CopyInput } from "../src/analyzer/copywriter";
import { applyIntent, keyFeaturePaths, mentionsKeyFeature, normalizeTone, sanitizeIntent } from "../src/analyzer/intent";
import { candidateUrls } from "../src/analyzer/media/page-guard";
import type { Storyboard } from "../src/shared/types";

test("sanitizeIntent trims, limits and maps the tone labels", () => {
  assert.equal(sanitizeIntent(undefined), undefined);
  assert.equal(sanitizeIntent({ projectDescription: "  ", keyFeature: "", targetAudience: "nope" }), undefined);
  const intent = sanitizeIntent({ projectDescription: ` Schedules\n meetings <b>fast</b> ${"x".repeat(500)}`, keyFeature: "  Entegrasyonlar ", targetAudience: "Viral/Trendy" })!;
  assert.ok(intent.projectDescription!.length <= 300);
  assert.ok(!/[<>\n]/.test(intent.projectDescription!));
  assert.equal(intent.keyFeature, "Entegrasyonlar");
  assert.equal(intent.targetAudience, "viral");
  assert.equal(normalizeTone("Developer/B2B"), "developer");
  assert.equal(normalizeTone("Minimal/Sade"), "minimal");
  assert.equal(normalizeTone("minimal"), "minimal");
});

test("key feature -> sub-pages to film", () => {
  assert.deepEqual(keyFeaturePaths("Entegrasyonlar").slice(0, 2), ["/integrations", "/apps"]);
  assert.deepEqual(keyFeaturePaths("Integrations").slice(0, 2), ["/integrations", "/apps"]);
  assert.equal(keyFeaturePaths("Hız")[0], "/performance");
  assert.equal(keyFeaturePaths("Fiyat")[0], "/pricing");
  assert.equal(keyFeaturePaths("Tasarım")[0], "/design");
  assert.ok(keyFeaturePaths("Offline mode").includes("/offline-mode"));
  assert.deepEqual(keyFeaturePaths(undefined), []);
  assert.ok(keyFeaturePaths("../../etc/passwd").every((p) => /^\/[a-z0-9/-]+$/.test(p)));
});

test("candidate pages start with the key feature's pages, auth pages never appear", () => {
  const urls = candidateUrls("https://cal.com", 12, "Entegrasyonlar");
  assert.deepEqual(urls.slice(0, 3), ["https://cal.com/integrations", "https://cal.com/apps", "https://cal.com/app-store"]);
  assert.ok(urls.includes("https://cal.com/"));
  assert.equal(candidateUrls("https://cal.com")[0], "https://cal.com/");
});

const stories = (): Storyboard[] =>
  [1, 2, 3].map((n) => ({
    id: `story-${n}`,
    angle: `Angle ${n}`,
    hook: `Hook ${n}`,
    features: [
      { title: "Fast setup", description: "Ready in minutes" },
      { title: "Team calendars", description: "Everyone in sync" },
      { title: "Calendar integrations", description: "Connect Google and Outlook" },
    ],
    outro: "Outro",
    cta: "Get started",
  }));

test("applyIntent puts the key feature in scenes 1 and 2 and sets hook and CTA", () => {
  const out = applyIntent(stories(), { keyFeature: "Integrations", projectDescription: "Scheduling for teams.", targetAudience: "developer" }, "Cal");
  for (const s of out) {
    assert.equal(s.features[0].title, "Calendar integrations");
    assert.equal(s.features.length, 3);
    assert.equal(s.cta, "Read the docs");
  }
  assert.equal(out[0].hook, "Scheduling for teams.");
  assert.ok(out[1].hook.includes("Integrations"));
});

test("applyIntent creates the key feature when the README never mentions it", () => {
  const out = applyIntent(stories(), { keyFeature: "Pricing", projectDescription: "Simple scheduling." }, "Cal", { tone: false });
  assert.equal(out[0].features[0].title, "Pricing");
  assert.equal(out[0].features[0].description, "Simple scheduling.");
  assert.ok(out[0].features[1].title.startsWith("Pricing"));
  assert.equal(out[0].cta, "Get started");
  assert.equal(applyIntent(stories(), undefined, "Cal").length, 3);
});

test("mentionsKeyFeature matches across Turkish/English word forms", () => {
  assert.equal(mentionsKeyFeature("Calendar integrations", "Entegrasyonlar"), false);
  assert.equal(mentionsKeyFeature("Calendar integrations", "Integrations"), true);
  assert.equal(mentionsKeyFeature("Hızlı kurulum", "Hız"), true);
  assert.equal(mentionsKeyFeature("Lightning speed", "Hız"), false);
});

const goodJson = (featureTitle: string) =>
  JSON.stringify({
    storyboards: [1, 2, 3].map((n) => ({
      angle: `Angle ${n}`,
      hook: `Hook ${n} for you`,
      features: [featureTitle, "Second thing", "Third thing"].map((t) => ({ title: t, description: `${t} description` })),
      outro: "Try it today",
      cta: "Get started",
    })),
  });

let n = 0;
const input = (intent?: CopyInput["intent"]): CopyInput => ({ name: `IntentProj${++n}`, tagline: "tag", projectType: "saas-web", readme: "readme", features: ["a"], intent });
const env = { LLM_API_KEY: "k" } as NodeJS.ProcessEnv;

test("the prompt carries the owner's brief and the scene focus rules", async () => {
  let system = "";
  let user = "";
  await writeStoryboards(input({ projectDescription: "Books meetings.", keyFeature: "Integrations", targetAudience: "viral" }), [], {
    env,
    fetchImpl: (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { messages: { role: string; content: string }[] };
      system = body.messages[0].content;
      user = body.messages[1].content;
      return new Response(JSON.stringify({ choices: [{ message: { content: goodJson("Integrations hub") } }] }));
    }) as unknown as typeof fetch,
  });
  assert.ok(system.includes('key feature: "Integrations"'));
  assert.ok(system.includes("scenes 1 and 2"));
  assert.ok(system.includes("Viral / trendy"));
  assert.ok(user.includes("<owner_brief>"));
  assert.ok(user.includes("description: Books meetings."));
  assert.ok(user.includes("key feature to emphasise: Integrations"));
  assert.ok(user.includes("tone: viral"));
});

test("without a brief the prompt has no brief section", async () => {
  let system = "";
  let user = "";
  await writeStoryboards(input(), [], {
    env,
    fetchImpl: (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { messages: { role: string; content: string }[] };
      system = body.messages[0].content;
      user = body.messages[1].content;
      return new Response(JSON.stringify({ choices: [{ message: { content: goodJson("Whatever") } }] }));
    }) as unknown as typeof fetch,
  });
  assert.ok(!system.includes("Owner's brief rules"));
  assert.ok(!user.includes("<owner_brief>"));
});

test("if the model ignores the key feature it is enforced in scenes 1-2", async () => {
  const notes: string[] = [];
  const out = await writeStoryboards(input({ keyFeature: "Pricing" }), notes, {
    env,
    fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: goodJson("Something else") } }] }))) as unknown as typeof fetch,
  });
  assert.equal(out?.storyboards[0].features[0].title, "Pricing");
  assert.equal(out?.storyboards[0].hook, "Hook 1 for you");
  assert.ok(notes.some((x) => x.includes("enforced")));
});

test("different briefs do not share a cache entry", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: goodJson("Speed") } }] }));
  }) as unknown as typeof fetch;
  const base = input({ keyFeature: "Speed" });
  await writeStoryboards(base, [], { env, fetchImpl });
  await writeStoryboards({ ...base, intent: { keyFeature: "Speed", targetAudience: "minimal" } }, [], { env, fetchImpl });
  await writeStoryboards({ ...base }, [], { env, fetchImpl });
  assert.equal(calls, 2);
});
