import { promises as fs } from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "vendor",
  "Pods",
  ".gradle",
  "Library",
  "Temp",
  "target",
  "__pycache__",
  ".venv",
  "venv",
]);

export interface WalkedFile {
  /** Absolute path. */
  abs: string;
  /** POSIX-style path relative to the project root. */
  rel: string;
  size: number;
}

const MAX_FILES = 6000;
const MAX_DEPTH = 6;

/** Bounded, symlink-safe directory walk. */
export async function walkProject(root: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await visit(abs, depth + 1);
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs);
        out.push({
          abs,
          rel: path.relative(root, abs).split(path.sep).join("/"),
          size: stat.size,
        });
      }
    }
  }

  await visit(root, 0);
  return out;
}
