# Deploying the render API on a shared Hetzner server

Goal: run the API **without touching your other projects**.

## What keeps other projects safe
- Everything runs in **one Docker container** (`docker-compose.yml`), with its own filesystem and network.
- **Hard caps**: 2 CPU cores, 3 GB RAM (`cpus`, `mem_limit`). If Chrome wants more it is slowed/killed - your other apps are not.
- Videos are written to a **named Docker volume** and deleted after 24h (`RENDER_RETENTION_HOURS`).
- The port is bound to `127.0.0.1:3100` only, so nothing is exposed until you choose how.
- No ports/config of existing services change, and it does not use host Docker socket or privileges.
- Runs as non-root with `cap_drop: ALL`.

Check free resources first: `nproc`, `free -h`, `df -h`. Lower `cpus`/`mem_limit` if the server is small (4K PRO renders need ~2-3 GB).

## 1. Start the container
```bash
git clone <this repo> appreklami && cd appreklami
git checkout cursor/saas-video-engine-949b      # or main after merge
docker compose up -d --build
curl http://127.0.0.1:3100/api/health          # -> {"ok":true,"queued":0}
```
Logs: `docker compose logs -f`. Stop: `docker compose down`.

## 2. Make it reachable over HTTPS
Netlify is HTTPS, so the API **must** be HTTPS too (browsers block http from an https page). Pick one:

**A. Cloudflare Tunnel** (no open ports, no changes to nginx/Apache/Caddy)
```bash
cloudflared tunnel --url http://127.0.0.1:3100    # quick test, prints a https://xxxx.trycloudflare.com URL
```
For a permanent URL create a named tunnel to e.g. `api.yourdomain.com` (Cloudflare Zero Trust dashboard).

**B. Your existing reverse proxy** - add a new subdomain (e.g. `api.yourdomain.com`, DNS A record -> server IP) and **only add a new vhost**:

Caddy:
```
api.yourdomain.com {
    reverse_proxy 127.0.0.1:3100 {
        flush_interval -1
    }
}
```
nginx (SSE needs buffering off):
```
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

## 3. Connect Netlify
Netlify -> Site settings -> Environment variables: `VITE_API_URL=https://api.yourdomain.com` (no trailing slash), then **trigger a new deploy**.
If your Netlify URL changes, update `CORS_ORIGIN` in `docker-compose.yml` and run `docker compose up -d`.

## Operating notes
- First render downloads nothing extra: Chrome is baked into the image at build time.
- One job renders at a time (`JOB_CONCURRENCY=1`), so load stays predictable.
- Free plan skips the PRO video (`DEFAULT_PLAN=free`); to try PRO yourself temporarily set `DEFAULT_PLAN=pro`.
- Remove everything: `docker compose down -v --rmi local`.
