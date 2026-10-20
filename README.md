# AppReklami - automated promo video engine (MVP)

Give it a GitHub repo or a local project folder and it produces three 15-20s vertical (9:16) promo videos
with [Remotion](https://www.remotion.dev), rendered one after another, with live progress.

```
POST /api/generate-videos ─► job queue ─► analyzer ─► Remotion CLI x3 ─► public/renders/<jobId>/*.mp4
                                │                                              ▲
            GET /api/jobs/:id (polling)  /  GET /api/jobs/:id/events (SSE) ─────┘
```

## Quick start

```bash
npm install
npm start                       # http://localhost:3000  (demo UI at /)
```

The first render downloads a headless Chrome automatically. Requires Node >= 20 and ffmpeg is bundled by Remotion.

```bash
curl -X POST localhost:3000/api/generate-videos \
  -H 'content-type: application/json' \
  -d '{"source":{"type":"github","url":"https://github.com/owner/repo"}}'
# -> 202 {"jobId":"...","statusUrl":"/api/jobs/...","eventsUrl":"/api/jobs/.../events","outputDir":"/renders/.../"}
```

Local folders are disabled unless `ALLOWED_LOCAL_ROOTS` is set, and must be inside it:

```bash
ALLOWED_LOCAL_ROOTS=./tests/fixtures npm start
curl -X POST localhost:3000/api/generate-videos -H 'content-type: application/json' \
  -d '{"source":{"type":"local","path":"'$PWD'/tests/fixtures/pixel-quest"}}'
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/generate-videos` | Body `{ "source": { "type": "github", "url": "https://github.com/o/r" } }` or `{ "type": "local", "path": "..." }`. Optional `"intent"` (see below). Queues a job, returns `202` + `jobId`. |
| GET | `/api/jobs/:jobId` | Polling: full job state, overall `progress` 0-100 and per-video progress. |
| GET | `/api/jobs/:jobId/events` | SSE stream: `progress` events on every visible change, final `done` event. |
| POST | `/api/jobs/:jobId/cancel` | Stops a queued or running job (kills the Remotion process). `409` if already finished. |
| POST | `/api/analyze` | Analysis only (project type, images, 3 storyboards) without rendering. Accepts the same `intent`. |
| GET | `/renders/<jobId>/option-N-<tier>.mp4` | Finished videos (static, range requests supported). |

Job state (also persisted to `public/renders/<jobId>/job.json`):

```json
{
  "jobId": "…", "status": "rendering", "progress": 47, "plan": "pro",
  "analysis": { "name": "Pixel Quest", "projectType": "game", "storyboards": ["…"] },
  "videos": [
    { "option": 1, "tier": "basic",   "status": "completed", "progress": 100, "resolution": "1080x1920", "watermark": true,  "url": "/renders/…/option-1-basic.mp4" },
    { "option": 2, "tier": "dynamic", "status": "rendering", "progress": 35,  "resolution": "1080x1920", "watermark": true },
    { "option": 3, "tier": "pro",     "status": "pending",   "progress": 0,   "resolution": "2160x3840", "watermark": false }
  ]
}
```

Overall progress: 0-5% analysis, then the remaining 95% is split evenly over the videos that will be rendered.

## Phone content: 3-step media pipeline

`src/analyzer/media-fetcher.ts` decides what is shown inside the phone mockup (never an empty frame):

1. **Live site** (`media/live-capture.ts`, rules in `media/page-guard.ts`) - `findLiveUrl` (package.json `homepage`, README links
   ranked by label/position, badges/code hosts/deploy buttons ignored) gives the product URL. Only public showcase pages are used:
   `/`, `/features`, `/product`, `/solutions`, `/docs` (an `app.`/`dashboard.` subdomain is replaced by its marketing domain first).
   - Login/sign-up screens are never filmed: URLs containing `/login`, `/signin`, `/auth`, `/register`, `/signup` (and redirects to
     them) are skipped, and so are pages whose rendered DOM shows a visible `input[type=password]` or a dominant sign-in form.
     Near-empty pages (profile stubs) are only used when nothing better exists. Pages are probed in a context that records nothing.
   - Product imagery found on the good pages (large screenshots, dashboard shots, demo `<video>` files) is downloaded through the
     SSRF guard and ranked ahead of repo assets; logos, avatars and low-contrast decorative art (grids, gradients) are discarded.
   - Up to two good pages are recorded in a 540x960 mobile viewport with smooth `window.scrollBy({ top: 500, behavior: 'smooth' })`
     steps (bouncing back to the top at the bottom). Nothing is clicked except cookie-banner accept buttons.
   Every request is checked by an SSRF guard (public IPs only, http/https, no credentials).
2. **Repo assets** - README hero/showcase images (local and GitHub-hosted), OpenGraph cards (`og-image.png`), screenshot-named files,
   and large images in asset folders (`apps/*/public`, `packages/*/assets`, `docs/images`, `.github/assets`). Image headers are read to
   reject icons/banners/odd aspect ratios. PNG/JPG/WebP/GIF (GIF renders as a still).
3. **Generated UI** (also used when every page needs a login) - `DynamicGeneratedUI` (Remotion) builds a dashboard (SaaS), feed (mobile) or HUD (game) from the README headings/features
   and slowly scrolls it. `PhoneMockup` falls back to it whenever `media` is empty.

Set `LIVE_CAPTURE=0` to disable step 1. Notes on what was tried are in `analysis.mediaNotes`.

### Audio sync

Sound and picture share one timing table, `src/remotion/sync.ts`. A sound's `hit` is the absolute frame where its
transient lands: the frame of peak velocity for springs (computed with `spring()`), the midpoint of linear fades, the
first frame of a cut. `scripts/generate-sfx.ts` pads every WAV (48 kHz, Remotion's mix rate) so its transient sits on a
whole frame and writes `src/remotion/sfx-manifest.ts`; `<Sfx hit={...}>` starts the clip that many frames earlier.
After changing any timing or sound run `npm run verify:audio`: it renders each composition and reports, per sound, how many
milliseconds the transient landed from its target (currently under 4 ms, 0.1 frame).

### Render safety

A broken asset must never kill a job (Remotion's `OffthreadVideo` crashes with `const json = await res.json()` when its
frame server cannot decode a file). Layers, outermost first:

1. `src/server/media-prep.ts` validates every staged file with ffprobe and re-encodes recordings to a seekable H.264 mp4.
   Unplayable videos become their screenshot, or nothing (generated UI).
2. `renderWithFallback` (`src/server/pipeline.ts`): if Remotion still fails because of media, the video is re-rendered with
   videos replaced by screenshots, then with no media at all.
3. `src/remotion/props.ts` (`normalizeVideoProps`, wired in via `calculateMetadata`) fills missing/malformed props with
   defaults and drops broken media entries.
4. `explainRenderError` (`src/server/renderer.ts`) turns Remotion's stderr into a short UI message (media / memory /
   timeout / browser); the raw stderr tail is logged on the server only.
5. `fetchJsonSafe` (`src/analyzer/http.ts`) is a non-throwing fetch + `res.json()` used for the LLM calls.



- `src/analyzer/` - source resolution (shallow `git clone` for GitHub; symlink-safe, path-restricted local folders),
  README parsing (title, tagline, feature bullets, image refs), project-type classifier (game / mobile-app / saas-web from
  manifests, dependencies and README keywords), image picker, and a storyboard builder that produces **3 marketing
  storyboards** (hook, 3 features, outro, CTA). `buildStoryboards` is the deterministic fallback; `copywriter.ts` asks an LLM for
  project-specific copy (see "AI copywriting") and falls back to the templates on any failure.
- `src/remotion/` - the three compositions (1080x1920 @ 30fps, 18s = hook 5s + 3 features x 3s + outro 4s):
  1. `promo-basic` (Free - Basic): vertical layout, blurred backdrop, fades, soft chime/whoosh. Watermarked.
  2. `promo-dynamic` (Free - Dynamic): spring-animated kinetic text, 8-bit blips/coin/power-up sounds, scanlines. Watermarked.
  3. `promo-pro` (PRO): camera push-in + punch zoom, deterministic screen shake, flash/vignette, cinematic impact sounds,
     rendered at 2x (2160x3840), no watermark.
- `src/server/` - Express API, in-memory job store (+ `job.json` on disk), FIFO queue (`JOB_CONCURRENCY`), and the
  renderer that spawns `remotion render` and parses its `Rendered x/y` / `Encoded x/y` output into a progress percentage.
  Each job gets a private Remotion `--public-dir` (shared sfx + that project's images), deleted after the job.
- `scripts/generate-sfx.ts` - synthesises every sound effect as WAV (`npm run sfx`), so there are no audio licences.

## Web UI and public deployment

`web/` is a Vite + React app (TR/EN, live progress ring per video, storyboard preview, shareable `?job=<id>` links).
It uses a Resend-inspired dark design system built with Tailwind CSS 3: tokens (colors, shadows, keyframes) live in
`web/tailwind.config.js`, shared primitives in `web/src/components/ui.tsx`, and the main pieces are
`BackgroundGrid`, `HeroSection`, `OnboardingWizard`, `VideoPreviewCard`, `JobStatusCard`, `StoryboardPanel`, `LandingPage`.

```bash
npm start                 # API on :3000
cd web && npm install && npm run dev   # UI on :5173, proxies /api and /renders to :3000
```

**Netlify cannot run the renderer** (functions are limited to seconds; Remotion needs Chrome, ffmpeg and minutes of CPU).
So the deployment is split:

1. **API** on a long-lived host (shared Hetzner server? see `docs/DEPLOY-HETZNER.md` - isolated container with CPU/RAM caps) (Fly.io / Railway / Render / VPS) using the `Dockerfile` (default `DEFAULT_PLAN=free`).
   Set `CORS_ORIGIN=https://admirable-sundae-231bb4.netlify.app` (already the default in the `Dockerfile`). Give it a persistent volume for `public/renders` (or add S3 later).
2. **UI** on Netlify: connect the repo (`netlify.toml` already sets base `web`, build `npm run build`, publish `dist`) and set the
   env var `VITE_API_URL=https://<your-api-host>`.

Before going public you also want auth/billing in `resolvePlan`; until then keep `DEFAULT_PLAN=free` and the rate limit on.

`npm run studio` opens Remotion Studio to iterate on the compositions.

## Configuration

| Env | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ALLOWED_LOCAL_ROOTS` | unset (disabled) | Comma-separated roots a `local` source must live in. Leave unset on a public server |
| `CORS_ORIGIN` | none | Origins allowed to call the API from a browser, comma-separated; `*` works inside the host (e.g. `https://*--my-site.netlify.app` for Netlify branch/preview deploys) |
| `RATE_LIMIT_PER_HOUR` | `5` | New jobs per client IP per hour (`0` = off) |
| `RENDER_RETENTION_HOURS` | `24` | Delete finished jobs/videos after this many hours (`0` = keep) |
| `HOST` | `0.0.0.0` | Interface to bind |
| `MAX_QUEUED_JOBS` | `20` | Reject new jobs (HTTP 429) when the queue is this long |
| `DEFAULT_PLAN` | `pro` | Plan given to every request until real auth exists (`free` skips the PRO video) |
| `ALLOW_PLAN_OVERRIDE` | off | `1` lets a client send `X-Plan: free\|pro` (dev/testing only) |
| `PRO_RENDER_SCALE` | `2` | Remotion `--scale` for the PRO video (1 = 1080p, 2 = 4K) |
| `PRO_PREVIEW` | on | Free plan: render a 6 s, 270x480, pre-blurred teaser of the PRO video (`previewUrl`) for the locked card. `0` disables it |
| `JOB_CONCURRENCY` | `1` | Jobs rendered in parallel (videos within a job are always sequential) |
| `RENDER_CONCURRENCY` | Remotion default | Passed to `--concurrency` |
| `LIVE_CAPTURE` | on | `0` disables the Playwright live-demo recording |
| `CHROME_PATH` | Remotion's Chrome | Chrome binary used for live-demo recording |
| `RENDER_TIMEOUT_MS` | `1200000` | Per-video render timeout |
| `LLM_API_KEY` | unset | Enables AI copywriting (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` also work) |
| `LLM_PROVIDER` | `openai` | `openai` (any OpenAI-compatible API) or `anthropic` |
| `LLM_MODEL` | `gpt-4o-mini` / `claude-3-5-haiku-latest` | Model name |
| `LLM_BASE_URL` | provider default | Custom endpoint |
| `COPY_LANGUAGE` | `English` | Language of the generated on-screen text |
| `AI_COPY` | on | `0` forces the template copy |

## AI copywriting

With `LLM_API_KEY` set, the analyzer sends the project name, type, detected features and a cleaned README excerpt to the
model and asks for 3 storyboards with different angles (hook, 3 features, outro, CTA). The README is treated as untrusted
data (prompt-injection guard in the system prompt), the reply is validated with zod, URLs/markdown are stripped and
every field is length-clamped to fit the video layout. Invalid or failed replies are retried once, then the job silently
continues with the template copy (the UI shows whether the copy was `AI-written` or `Template`). Results are cached in
memory per input. Cost is one small request per analysis.

## User intent wizard

After a GitHub URL is entered, the web UI shows an optional wizard. Its answers travel as `intent` in the request body:

```json
{ "source": { "type": "github", "url": "https://github.com/o/r" },
  "intent": { "projectDescription": "One-line pitch", "keyFeature": "Integrations", "targetAudience": "developer" } }
```

- `projectDescription` replaces the README-derived tagline (Basic hook) and is given to the LLM as an `<owner_brief>` (untrusted data).
- `keyFeature` must lead scenes 1 and 2 (hooks and text overlays). The LLM is told so; if its reply ignores it, the key feature is enforced afterwards. Without an LLM the template copy uses it as well.
- `targetAudience` is the tone: `developer` (Developer/B2B), `viral` (Viral/Trendy), `minimal` (Minimal/Sade); it steers the prompt and the CTA.
- The live-site crawler visits matching sub-pages first (`Integrations` -> `/integrations`, `/apps`, `/marketplace`...; also speed, design, pricing, security, API, analytics, templates, AI, mobile, teams, docs, or `/<slug>`). If none exists it falls back to the normal showcase pages.

All fields are optional, sanitized (control characters, `<>` and backticks stripped, length-limited) and part of the copy cache key.

## Not in the MVP (next steps)

Authentication/billing (see `resolvePlan` in `src/server/app.ts`), rate limiting, a durable queue (BullMQ/SQS) and object
storage (S3) instead of the local disk, and private-repo cloning.

## Tests

`npm test` (analyzer + progress logic) and `npm run typecheck`.
