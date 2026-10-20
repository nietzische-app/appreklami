import type { Job, ServerConfig } from "./types";

/** Empty in dev (Vite proxy) / when the UI is served by the API; set VITE_API_URL on Netlify. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const assetUrl = (path: string) => (path.startsWith("http") ? path : `${API_BASE}${path}`);

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export const getConfig = () => fetch(`${API_BASE}/api/config`).then((r) => json<ServerConfig>(r));
export const getJob = (id: string) => fetch(`${API_BASE}/api/jobs/${id}`).then((r) => json<Job>(r));

export const cancelJob = (id: string) =>
  fetch(`${API_BASE}/api/jobs/${id}/cancel`, { method: "POST" }).then((r) => json<Job>(r));

export const createJob = (source: { type: "github"; url: string } | { type: "local"; path: string }) =>
  fetch(`${API_BASE}/api/generate-videos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  }).then((r) => json<Job & { eventsUrl: string }>(r));

/** SSE with an automatic polling fallback (proxies that buffer event streams, flaky mobile networks). */
export function watchJob(jobId: string, onUpdate: (job: Job) => void): () => void {
  let stopped = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  const terminal = (j: Job) => ["completed", "failed", "cancelled"].includes(j.status);

  const startPolling = () => {
    if (poll || stopped) return;
    poll = setInterval(async () => {
      try {
        const job = await getJob(jobId);
        onUpdate(job);
        if (terminal(job)) stop();
      } catch {
        /* keep trying */
      }
    }, 2000);
  };

  const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/events`);
  const handle = (ev: MessageEvent) => {
    const job = JSON.parse(ev.data) as Job;
    onUpdate(job);
    if (terminal(job)) stop();
  };
  es.addEventListener("progress", handle as EventListener);
  es.addEventListener("done", handle as EventListener);
  es.onerror = () => {
    es.close();
    startPolling();
  };

  function stop() {
    stopped = true;
    es.close();
    if (poll) clearInterval(poll);
  }
  return stop;
}
