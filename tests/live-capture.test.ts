import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";
import { captureLiveSite, findChrome } from "../src/analyzer/media/live-capture";
import { candidateUrls, isAuthUrl, isLoginPage, isThinPage, looksDecorative, scoreShowcaseImage, type PageProbe } from "../src/analyzer/media/page-guard";

const probe = (over: Partial<PageProbe> = {}): PageProbe => ({ pw: 0, email: 0, textLen: 5000, loginWords: false, formRatio: 0, headings: 8, scrollHeight: 6000, vh: 800, ...over });

test("auth URLs are recognised, product URLs are not", () => {
  for (const u of ["https://x.com/login", "https://x.com/auth/login", "https://x.com/en/signin?next=/", "https://x.com/register", "https://x.com/signup", "https://x.com/sign-up", "https://x.com/auth", "https://login.x.com/", "https://accounts.x.com/"]) {
    assert.equal(isAuthUrl(u), true, u);
  }
  for (const u of ["https://x.com/", "https://x.com/features", "https://x.com/authors", "https://x.com/docs/auth-guide", "https://x.com/product"]) {
    assert.equal(isAuthUrl(u), false, u);
  }
});

test("candidate pages: showcase paths, app subdomain falls back to the marketing domain first, auth never listed", () => {
  assert.deepEqual(candidateUrls("https://cal.com"), ["https://cal.com/", "https://cal.com/features", "https://cal.com/product", "https://cal.com/solutions", "https://cal.com/docs"]);
  const app = candidateUrls("https://app.cal.com/");
  assert.equal(app[0], "https://cal.com/");
  assert.ok(app.includes("https://app.cal.com/"));
  assert.ok(candidateUrls("https://x.com/auth/login").every((u) => !isAuthUrl(u)));
  assert.equal(candidateUrls("https://x.com/tour")[0], "https://x.com/tour");
});

test("login pages are detected from the rendered DOM", () => {
  assert.equal(isLoginPage(probe({ pw: 1, textLen: 300, scrollHeight: 800, formRatio: 0.4 })), true);
  assert.equal(isLoginPage(probe({ email: 1, loginWords: true, textLen: 500, scrollHeight: 900 })), true);
  assert.equal(isLoginPage(probe({ loginWords: true, textLen: 200, headings: 1, formRatio: 0.3 })), true);
  assert.equal(isLoginPage(probe()), false);
  assert.equal(isLoginPage(probe({ email: 1, loginWords: false, textLen: 6000 })), false);
  assert.equal(isLoginPage(probe({ pw: 1, textLen: 8000, scrollHeight: 9000, formRatio: 0.05 })), false);
});

test("thin pages and decorative art are recognised", () => {
  assert.equal(isThinPage(probe({ textLen: 250, scrollHeight: 960 })), true);
  assert.equal(isThinPage(probe()), false);
  assert.equal(looksDecorative({ lumStd: 1.5, edge: 0.4 }), true);
  assert.equal(looksDecorative({ lumStd: 48, edge: 3.8 }), false);
  assert.equal(looksDecorative(null), false);
});

test("showcase images: big product shots score, logos/avatars/small images do not", () => {
  const img = (src: string, width: number, height: number, alt = "") => ({ src, alt, width, height });
  assert.ok(scoreShowcaseImage(img("https://x.com/dashboard-preview.png", 1600, 900)) > scoreShowcaseImage(img("https://x.com/photo.jpg", 1600, 900)));
  assert.equal(scoreShowcaseImage(img("https://x.com/logo.png", 1600, 900)), 0);
  assert.equal(scoreShowcaseImage(img("https://x.com/a.png", 300, 300)), 0);
  assert.equal(scoreShowcaseImage(img("https://x.com/banner.png", 2400, 400)), 0);
  assert.equal(scoreShowcaseImage(img("https://x.com/hero.svg", 1600, 900)), 0);
  assert.equal(scoreShowcaseImage(img("https://x.com/shot.png", 1200, 700, "Customer testimonial")), 0);
});

const png = (w: number, h: number): Buffer => {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const dark = ((x >> 4) + (y >> 4)) % 2 === 0;
      row[1 + x * 3] = dark ? 30 : 235;
      row[2 + x * 3] = dark ? 60 : 240;
      row[3 + x * 3] = dark ? 140 : 250;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};

const lorem = Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i}: scheduling, teams, workflows and analytics for every business.</p>`).join("");
const pages: Record<string, string> = {
  "/auth/login": `<h1>Sign in</h1><form><input type="email" name="email"><input type="password" name="password"><button>Sign in</button></form>`,
  "/features": `<h1>Features</h1><img src="/img/dashboard-preview.png" alt="Dashboard preview">${lorem}`,
  "/product": `<h2>Welcome back</h2><form><input type="email" name="email" placeholder="Email"><button>Log in</button></form>`,
  "/docs": `<h1>Docs</h1>${lorem}`,
};

test("captureLiveSite skips login pages, never films them and keeps product pages", async (t) => {
  const executablePath = await findChrome();
  if (!executablePath) return t.skip("no Chrome available");

  const hits: Record<string, number> = {};
  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    hits[url] = (hits[url] ?? 0) + 1;
    if (url === "/") {
      res.writeHead(302, { location: "/auth/login" });
      return res.end();
    }
    if (url === "/img/dashboard-preview.png") {
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(png(1400, 800));
    }
    const html = pages[url];
    if (!html) {
      res.writeHead(404);
      return res.end("nope");
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><body style="margin:0;font-family:sans-serif">${html}</body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "live-capture-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const notes: string[] = [];
  const result = await captureLiveSite(`${base}/`, dir, notes, { isSafeUrl: async () => true, isPublic: async () => true, executablePath });

  assert.ok(notes.some((n) => n.includes("redirected to a login")), notes.join("\n"));
  assert.ok(notes.some((n) => n.includes("/product") && n.includes("login form detected")), notes.join("\n"));
  assert.ok(result.recordings.length >= 1, notes.join("\n"));
  assert.ok(result.recordings.every((r) => r.kind === "video" && r.origin === "live-demo"));
  assert.equal(result.showcase.length, 1, notes.join("\n"));
  assert.equal(result.showcase[0].kind, "image");
  assert.equal(result.showcase[0].width, 1400);
  // The login page was only ever visited while probing "/", never again while recording.
  assert.equal(hits["/auth/login"], 1);
  assert.ok(hits["/features"] >= 2, "features page is probed and then recorded");
});

test("captureLiveSite returns nothing when every page needs a login", async (t) => {
  const executablePath = await findChrome();
  if (!executablePath) return t.skip("no Chrome available");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(pages["/auth/login"]);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "live-capture-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const notes: string[] = [];
  const result = await captureLiveSite(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, dir, notes, { isSafeUrl: async () => true, isPublic: async () => true, executablePath });
  assert.deepEqual(result, { recordings: [], showcase: [] });
  assert.ok(notes.some((n) => n.includes("every candidate page needs a login or is empty")), notes.join("\n"));
});

test("captureLiveSite films the key feature's page first", async (t) => {
  const executablePath = await findChrome();
  if (!executablePath) return t.skip("no Chrome available");
  const body = (title: string) => `<!doctype html><html><body style="margin:0"><h1>${title}</h1>${lorem}</body></html>`;
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    hits.push(url);
    const html = url === "/" ? body("Home") : url === "/integrations" ? body("Integrations") : undefined;
    res.writeHead(html ? 200 : 404, { "content-type": "text/html" });
    res.end(html ?? "nope");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "live-capture-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const notes: string[] = [];
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const result = await captureLiveSite(`${base}/`, dir, notes, { isSafeUrl: async () => true, isPublic: async () => true, executablePath }, { keyFeature: "Entegrasyonlar" });

  const okNotes = notes.filter((n) => n.startsWith("public page ok"));
  assert.ok(okNotes[0].endsWith("/integrations"), notes.join("\n"));
  assert.ok(notes.some((n) => n.includes('key feature "Entegrasyonlar"')));
  assert.equal(result.recordings.length, 2);
  assert.ok(hits.indexOf("/integrations") < hits.indexOf("/"), "integrations is probed before the home page");
});
