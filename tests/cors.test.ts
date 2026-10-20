import assert from "node:assert/strict";
import { test } from "node:test";

test("CORS_ORIGIN supports exact origins and host wildcards", async () => {
  process.env.CORS_ORIGIN = "https://my-site.netlify.app, https://*--my-site.netlify.app";
  const { isOriginAllowed } = await import("../src/server/app");
  assert.ok(isOriginAllowed("https://my-site.netlify.app"));
  assert.ok(isOriginAllowed("https://cursor-branch-949b--my-site.netlify.app"));
  assert.ok(isOriginAllowed("https://deploy-preview-3--my-site.netlify.app"));
  assert.ok(!isOriginAllowed("https://evil.com"));
  assert.ok(!isOriginAllowed("https://x--my-site.netlify.app.evil.com"));
  assert.ok(!isOriginAllowed("http://my-site.netlify.app"));
  assert.ok(!isOriginAllowed("https://other.netlify.app"));
});
