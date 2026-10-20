import assert from "node:assert/strict";
import { test } from "node:test";
import { pickImages } from "../src/analyzer/images";
import { parseImageSize } from "../src/analyzer/media/image-size";
import { findLiveUrl } from "../src/analyzer/media/live-url";
import { isPrivateIp, isSafePublicUrl } from "../src/analyzer/media/url-safety";

test("live URL: package.json homepage wins, badges/code hosts/deploy buttons are ignored", () => {
  const readme = [
    "# Cal.com",
    "[![npm](https://img.shields.io/npm/v/x.svg)](https://www.npmjs.com/package/x)",
    "[Deploy on Railway](https://railway.app/new/template/cal)",
    "[Discord](https://discord.gg/abc)",
    "Check out our [website](https://cal.com/?utm_source=readme) or read the [docs](https://docs.cal.com/guide).",
  ].join("\n");
  assert.equal(findLiveUrl({ readme, packageHomepage: "https://cal.com", name: "Cal.com" }), "https://cal.com/");
  assert.equal(findLiveUrl({ readme, name: "Cal.com" }), "https://cal.com/");
  assert.equal(findLiveUrl({ readme: "# X\nSee https://github.com/a/b and https://shields.io/x", name: "X" }), undefined);
  assert.equal(findLiveUrl({ readme: "[Live demo](https://my-game.itch.io/play)", name: "Game" }), "https://my-game.itch.io/play");
});

test("SSRF guard blocks private, loopback, metadata and non-http targets", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
    assert.ok(isPrivateIp(ip), ip);
  }
  assert.ok(!isPrivateIp("8.8.8.8"));
  for (const url of ["http://localhost:3000", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "https://user:pw@example.com", "http://127.0.0.1:22", "https://example.com:6379"]) {
    assert.equal(await isSafePublicUrl(url), false, url);
  }
});

test("image header parser reads PNG and GIF sizes", () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(630, 20);
  assert.deepEqual(parseImageSize(png), { width: 1200, height: 630 });
  const gif = Buffer.from("GIF89a\x40\x01\xb4\x00\x00\x00\x00\x00\x00\x00\x00", "binary");
  assert.deepEqual(parseImageSize(gif), { width: 320, height: 180 });
});

test("monorepo assets: OG cards and tier-B asset-dir images are found, icons/integrations are not", () => {
  const f = (rel: string, size = 300_000) => ({ abs: `/r/${rel}`, rel, size });
  const files = [
    f("apps/web/public/og-image.png"),
    f("apps/web/public/icon-192.png"),
    f("packages/app-store/zoom/static/1.jpeg"),
    f("docs/images/hero-dashboard.gif"),
    f("apps/web/public/team-photo.jpg"),
  ];
  const a = pickImages(files, [], 10, "AB").map((p) => p.replace("/r/", ""));
  assert.deepEqual(a.sort(), ["apps/web/public/og-image.png", "docs/images/hero-dashboard.gif"]);
  const onlyB = pickImages([f("apps/web/public/team-photo.jpg"), f("apps/web/public/icon.png")], [], 10, "AB").map((p) => p.replace("/r/", ""));
  assert.deepEqual(onlyB, ["apps/web/public/team-photo.jpg"]);
});
