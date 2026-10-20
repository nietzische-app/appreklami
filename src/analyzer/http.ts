export interface SafeJson<T> {
  ok: boolean;
  status: number;
  /** Parsed body, or `fallback` when the request failed or the body was not JSON. */
  data: T;
  error?: string;
}

/** fetch + res.json() that never throws: network errors, non-2xx and non-JSON bodies all yield `fallback`. */
export async function fetchJsonSafe<T>(fetchImpl: typeof fetch, url: string, init: RequestInit, fallback: T): Promise<SafeJson<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    return { ok: false, status: 0, data: fallback, error: `request failed: ${(err as Error).message.split("\n")[0]}` };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, status: res.status, data: fallback, error: `HTTP ${res.status}` };
  }
  try {
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: res.status, data: fallback, error: "response was not valid JSON" };
  }
}
