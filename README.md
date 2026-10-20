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

Local folders must be inside `ALLOWED_LOCAL_ROOTS` (default `./projects`):

```bash
ALLOWED_LOCAL_ROOTS=./tests/fixtures npm start
curl -X POST localhost:3000/api/generate-videos -H 'content-type: application/json' \
  -d '{"source":{"type":"local","path":"'$PWD'/tests/fixtures/pixel-quest"}}'
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/generate-videos` | Body `{ "source": { "type": "github", "url": "https://github.com/o/r" } }` or `{ "type": "local", "path": "..." }`. Queues a job, returns `202` + `jobId`. |
| GET | `/api/jobs/:jobId` | Polling: full job state, overall `progress` 0-100 and per-video progress. |
| GET | `/api/jobs/:jobId/events` | SSE stream: `progress` events on every visible change, final `done` event. |
| POST | `/api/analyze` | Analysis only (project type, images, 3 storyboards) without rendering. |
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

## Architecture

- `src/analyzer/` - source resolution (shallow `git clone` for GitHub; symlink-safe, path-restricted local folders),
  README parsing (title, tagline, feature bullets, image refs), project-type classifier (game / mobile-app / saas-web from
  manifests, dependencies and README keywords), image picker, and a storyboard builder that produces **3 marketing
  storyboards** (hook, 3 features, outro, CTA). `buildStoryboards` is deterministic; replace it with an LLM call without
  touching the rest.
- `src/remotion/` - the three compositions (1080x1920 @ 30fps, 18s = hook 5s + 3 features x 3s + outro 4s):
  1. `promo-basic` (Free - Basic): vertical layout, blurred backdrop, fades, soft chime/whoosh. Watermarked.
  2. `promo-dynamic` (Free - Dynamic): spring-animated kinetic text, 8-bit blips/coin/power-up sounds, scanlines. Watermarked.
  3. `promo-pro` (PRO): camera push-in + punch zoom, deterministic screen shake, flash/vignette, cinematic impact sounds,
     rendered at 2x (2160x3840), no watermark.
- `src/server/` - Express API, in-memory job store (+ `job.json` on disk), FIFO queue (`JOB_CONCURRENCY`), and the
  renderer that spawns `remotion render` and parses its `Rendered x/y` / `Encoded x/y` output into a progress percentage.
  Each job gets a private Remotion `--public-dir` (shared sfx + that project's images), deleted after the job.
- `scripts/generate-sfx.ts` - synthesises every sound effect as WAV (`npm run sfx`), so there are no audio licences.

`npm run studio` opens Remotion Studio to iterate on the compositions.

## Configuration

| Env | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ALLOWED_LOCAL_ROOTS` | `./projects` | Comma-separated roots a `local` source must live in |
| `DEFAULT_PLAN` | `pro` | Plan given to every request until real auth exists (`free` skips the PRO video) |
| `ALLOW_PLAN_OVERRIDE` | off | `1` lets a client send `X-Plan: free\|pro` (dev/testing only) |
| `PRO_RENDER_SCALE` | `2` | Remotion `--scale` for the PRO video (1 = 1080p, 2 = 4K) |
| `JOB_CONCURRENCY` | `1` | Jobs rendered in parallel (videos within a job are always sequential) |
| `RENDER_CONCURRENCY` | Remotion default | Passed to `--concurrency` |
| `RENDER_TIMEOUT_MS` | `1200000` | Per-video render timeout |

## Not in the MVP (next steps)

Authentication/billing (see `resolvePlan` in `src/server/app.ts`), rate limiting, a durable queue (BullMQ/SQS) and object
storage (S3) instead of the local disk, private-repo cloning, and LLM-written copy.

## Tests

`npm test` (analyzer + progress logic) and `npm run typecheck`.
