import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { JOB_ID_RE } from "./jobStore";

/** Deletes finished job folders (videos + job.json) older than RENDER_RETENTION_HOURS. */
export async function cleanupOldRenders(): Promise<number> {
  if (!config.retentionHours) return 0;
  const cutoff = Date.now() - config.retentionHours * 3_600_000;
  let removed = 0;
  for (const entry of await fs.readdir(config.rendersDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !JOB_ID_RE.test(entry.name)) continue;
    const dir = path.join(config.rendersDir, entry.name);
    const stat = await fs.stat(dir).catch(() => undefined);
    if (stat && stat.mtimeMs < cutoff) {
      await fs.rm(dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

export function scheduleCleanup(): void {
  const run = () => cleanupOldRenders().then((n) => n && console.log(`[cleanup] removed ${n} old job(s)`)).catch(() => {});
  void run();
  setInterval(run, 3_600_000).unref();
}
