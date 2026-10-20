import assert from "node:assert/strict";
import { test } from "node:test";
import { getLlmConfig, parseCopyResponse, readmeForPrompt, writeStoryboards, type CopyInput } from "../src/analyzer/copywriter";

const story = (n: number) => ({
  angle: `Angle ${n}`,
  hook: `Hook number ${n} for the viewer`,
  features: [1, 2, 3].map((i) => ({ title: `Feature ${i}`, description: `Does thing ${i} well` })),
  outro: "Try it today",
  cta: "Get started",
});
const goodJson = JSON.stringify({ storyboards: [story(1), story(2), story(3)] });

let counter = 0;
const input = (): CopyInput => ({
  name: `Proj${++counter}`,
  tagline: "A tagline",
  projectType: "saas-web",
  readme: "Some readme text",
  features: ["Fast", "Simple"],
});

const openaiResponse = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const env = { LLM_API_KEY: "test-key" } as NodeJS.ProcessEnv;

test("no API key -> undefined and no request", async () => {
  let called = false;
  const out = await writeStoryboards(input(), [], {
    env: {} as NodeJS.ProcessEnv,
    fetchImpl: (async () => {
      called = true;
      return openaiResponse(goodJson);
    }) as typeof fetch,
  });
  assert.equal(out, undefined);
  assert.equal(called, false);
});

test("AI_COPY=0 disables the feature", () => {
  assert.equal(getLlmConfig({ LLM_API_KEY: "k", AI_COPY: "0" } as NodeJS.ProcessEnv), undefined);
});

test("OpenAI-compatible request and response", async () => {
  let url = "";
  let auth = "";
  let body: { messages: { role: string; content: string }[] } | undefined;
  const out = await writeStoryboards(input(), [], {
    env: { ...env, LLM_BASE_URL: "http://llm.test/v1/" } as NodeJS.ProcessEnv,
    fetchImpl: (async (u: string, init: RequestInit) => {
      url = u;
      auth = (init.headers as Record<string, string>).authorization;
      body = JSON.parse(init.body as string);
      return openaiResponse(`Here you go:\n${goodJson}`);
    }) as unknown as typeof fetch,
  });
  assert.equal(url, "http://llm.test/v1/chat/completions");
  assert.equal(auth, "Bearer test-key");
  assert.ok(body?.messages[1].content.includes("<project>"));
  assert.equal(out?.length, 3);
  assert.equal(out?.[0].id, "story-1");
  assert.equal(out?.[2].features.length, 3);
});

test("Anthropic request and response", async () => {
  let url = "";
  let key = "";
  const out = await writeStoryboards(input(), [], {
    env: { LLM_PROVIDER: "anthropic", LLM_API_KEY: "ak" } as NodeJS.ProcessEnv,
    fetchImpl: (async (u: string, init: RequestInit) => {
      url = u;
      key = (init.headers as Record<string, string>)["x-api-key"];
      return new Response(JSON.stringify({ content: [{ type: "text", text: goodJson }] }), { status: 200 });
    }) as unknown as typeof fetch,
  });
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(key, "ak");
  assert.equal(out?.length, 3);
});

test("invalid output retries once then falls back to undefined", async () => {
  let calls = 0;
  const notes: string[] = [];
  const out = await writeStoryboards(input(), notes, {
    env,
    fetchImpl: (async () => {
      calls++;
      return openaiResponse("not json at all");
    }) as unknown as typeof fetch,
  });
  assert.equal(out, undefined);
  assert.equal(calls, 2);
  assert.ok(notes.some((n) => n.includes("invalid response")));
});

test("HTTP errors never throw", async () => {
  const out = await writeStoryboards(input(), [], {
    env,
    fetchImpl: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
  });
  assert.equal(out, undefined);
});

test("retry recovers after a transient failure", async () => {
  let calls = 0;
  const out = await writeStoryboards(input(), [], {
    env,
    fetchImpl: (async () => {
      calls++;
      return calls === 1 ? new Response("err", { status: 503 }) : openaiResponse(goodJson);
    }) as unknown as typeof fetch,
  });
  assert.equal(calls, 2);
  assert.equal(out?.length, 3);
});

test("identical input is served from cache", async () => {
  const same = input();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return openaiResponse(goodJson);
  }) as unknown as typeof fetch;
  await writeStoryboards(same, [], { env, fetchImpl });
  await writeStoryboards({ ...same }, [], { env, fetchImpl });
  assert.equal(calls, 1);
});

test("output is sanitized and length-clamped", () => {
  const long = "word ".repeat(60);
  const raw = JSON.stringify({
    storyboards: [1, 2, 3].map(() => ({
      angle: "Angle",
      hook: `**${long}** https://evil.example/x`,
      features: [1, 2, 3].map(() => ({ title: `# ${long}`, description: long })),
      outro: "Done",
      cta: "Go",
    })),
  });
  const out = parseCopyResponse(raw)!;
  assert.ok(out[0].hook.length <= 65);
  assert.ok(!out[0].hook.includes("http"));
  assert.ok(!out[0].hook.includes("*"));
  assert.ok(out[0].features[0].title.length <= 31);
  assert.ok(!out[0].features[0].title.includes("#"));
});

test("rejects incomplete responses", () => {
  assert.equal(parseCopyResponse(JSON.stringify({ storyboards: [story(1)] })), undefined);
  assert.equal(parseCopyResponse("{}"), undefined);
  assert.equal(parseCopyResponse(""), undefined);
});

test("readmeForPrompt strips fences, comments, images and html", () => {
  const out = readmeForPrompt("# T\n<!-- c -->\n```sh\nrm -rf /\n```\n![img](a.png)\n<div>Hello</div>\n");
  assert.ok(!out.includes("rm -rf"));
  assert.ok(!out.includes("img"));
  assert.ok(!out.includes("<div>"));
  assert.ok(out.includes("Hello"));
});
