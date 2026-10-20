import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SourceInput } from "../shared/types";

const execFileAsync = promisify(execFile);

const GITHUB_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

export class SourceError extends Error {}

export function parseGithubUrl(url: string): { owner: string; repo: string; cloneUrl: string } {
  const m = GITHUB_URL.exec(url.trim());
  if (!m) throw new SourceError("Only https://github.com/<owner>/<repo> URLs are supported.");
  return { owner: m[1], repo: m[2], cloneUrl: `https://github.com/${m[1]}/${m[2]}.git` };
}

export function allowedLocalRoots(): string[] {
  const configured = process.env.ALLOWED_LOCAL_ROOTS;
  if (!configured) return [];
  return configured.split(",").map((s) => path.resolve(s.trim())).filter(Boolean);
}

async function resolveLocal(input: string): Promise<string> {
  if (allowedLocalRoots().length === 0) {
    throw new SourceError("Local folder sources are disabled on this server (set ALLOWED_LOCAL_ROOTS).");
  }
  let real: string;
  try {
    real = await fs.realpath(path.resolve(input));
  } catch {
    throw new SourceError(`Local path not found: ${input}`);
  }
  const roots = await Promise.all(allowedLocalRoots().map((r) => fs.realpath(r).catch(() => r)));
  const inside = roots.some((r) => real === r || real.startsWith(r + path.sep));
  if (!inside) {
    throw new SourceError("Local path is outside ALLOWED_LOCAL_ROOTS.");
  }
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new SourceError("Local path must be a directory.");
  return real;
}

export interface ResolvedSource {
  root: string;
  displayName: string;
  cleanup: () => Promise<void>;
}

/** Turns a user-supplied source into a directory on disk (shallow clone for GitHub). */
export async function resolveSource(source: SourceInput): Promise<ResolvedSource> {
  if (source.type === "local") {
    const root = await resolveLocal(source.path);
    return { root, displayName: path.basename(root), cleanup: async () => {} };
  }

  const { repo, cloneUrl } = parseGithubUrl(source.url);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "appreklami-clone-"));
  const target = path.join(tmp, repo);
  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--single-branch", "--", cloneUrl, target], {
      timeout: 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true });
    const stderr = String((err as { stderr?: string }).stderr ?? "");
    if (/not found|could not read Username|Authentication failed|terminal prompts disabled/i.test(stderr)) {
      throw new SourceError(
        "Repository not found or it is private. Only public GitHub repositories are supported - make the repo public or check the URL.",
      );
    }
    if (/timed out|killed/i.test((err as Error).message) || (err as { killed?: boolean }).killed) {
      throw new SourceError("Cloning the repository timed out. Try a smaller repository.");
    }
    throw new SourceError(`Could not clone ${cloneUrl}: ${stderr.split("\n").find(Boolean) ?? "unknown error"}`);
  }
  return {
    root: target,
    displayName: repo,
    cleanup: () => fs.rm(tmp, { recursive: true, force: true }),
  };
}

/** Cheap pre-flight check (no clone) so the API can reject bad sources with HTTP 400 before queueing. */
export async function validateSource(source: SourceInput): Promise<void> {
  if (source.type === "github") parseGithubUrl(source.url);
  else await resolveLocal(source.path);
}
