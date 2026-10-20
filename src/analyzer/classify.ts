import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectType } from "../shared/types";
import type { WalkedFile } from "./walk";

export interface Classification {
  type: ProjectType;
  confidence: number;
  signals: string[];
  /** Name from package.json / pubspec, when available. */
  manifestName?: string;
  manifestDescription?: string;
  manifestHomepage?: string;
}

const KEYWORDS: Record<ProjectType, RegExp[]> = {
  game: [
    /\bgame(s|play)?\b/i,
    /\bplayer(s)?\b/i,
    /\blevel(s)?\b/i,
    /\bunity\b|\bunreal\b|\bgodot\b|\bphaser\b|\bpygame\b|\bbevy\b/i,
    /\bsprite|\bhigh ?score|\bmultiplayer|\barcade|\bplatformer|\bboss\b/i,
  ],
  "mobile-app": [
    /\bmobile app\b|\bios\b|\bandroid\b/i,
    /\bapp store\b|\bgoogle play\b|\btestflight\b/i,
    /\breact native\b|\bflutter\b|\bswiftui\b|\bjetpack compose\b|\bexpo\b/i,
    /\bpush notification/i,
  ],
  "saas-web": [
    /\bsaas\b|\bdashboard\b|\bweb app\b|\bplatform\b/i,
    /\bapi\b|\bwebhook|\bintegration/i,
    /\bsubscription|\bbilling|\bteam(s)?\b|\bworkspace/i,
    /\bnext\.?js\b|\bnuxt\b|\bremix\b|\bsvelte(kit)?\b|\bexpress\b|\bdjango\b|\brails\b/i,
  ],
};

async function readJson(file: string): Promise<any | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

export async function classifyProject(
  root: string,
  files: WalkedFile[],
  readmeText: string,
): Promise<Classification> {
  const scores: Record<ProjectType, number> = { game: 0, "mobile-app": 0, "saas-web": 0 };
  const signals: string[] = [];
  const bump = (t: ProjectType, n: number, why: string) => {
    scores[t] += n;
    signals.push(`${t}: ${why}`);
  };

  const rels = new Set(files.map((f) => f.rel));
  const hasRel = (re: RegExp) => files.some((f) => re.test(f.rel));

  if (rels.has("project.godot")) bump("game", 8, "project.godot");
  if (rels.has("ProjectSettings/ProjectVersion.txt") || hasRel(/^Assets\/.+\.unity$/)) bump("game", 8, "Unity project");
  if (hasRel(/\.uproject$/)) bump("game", 8, "Unreal project");
  if (hasRel(/\.(tscn|gd)$/)) bump("game", 3, "Godot scripts/scenes");

  if (rels.has("pubspec.yaml")) bump("mobile-app", 5, "pubspec.yaml (Flutter)");
  if (hasRel(/^(android|ios)\/.+/) && rels.has("pubspec.yaml")) bump("mobile-app", 2, "android/ios dirs");
  if (hasRel(/\.xcodeproj\//) || hasRel(/\.xcodeproj$/) || hasRel(/^ios\/.+\.(swift|m)$/)) bump("mobile-app", 5, "Xcode project");
  if (hasRel(/(^|\/)AndroidManifest\.xml$/)) bump("mobile-app", 5, "AndroidManifest.xml");
  if (rels.has("app.json") && rels.has("package.json")) bump("mobile-app", 1, "app.json");

  const pkg = await readJson(path.join(root, "package.json"));
  let manifestName: string | undefined;
  let manifestDescription: string | undefined;
  let manifestHomepage: string | undefined;
  if (pkg) {
    manifestName = typeof pkg.name === "string" ? pkg.name : undefined;
    manifestDescription = typeof pkg.description === "string" ? pkg.description : undefined;
    manifestHomepage = typeof pkg.homepage === "string" ? pkg.homepage : undefined;
    const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
    const has = (...names: string[]) => names.some((n) => n in deps);
    if (has("react-native", "expo", "@capacitor/core", "@ionic/react", "nativescript")) bump("mobile-app", 8, "RN/Expo/Capacitor dependency");
    if (has("phaser", "three", "pixi.js", "@babylonjs/core", "kaboom", "excalibur", "melonjs", "@react-three/fiber")) bump("game", 6, "game/3D engine dependency");
    if (has("next", "nuxt", "@remix-run/react", "@sveltejs/kit", "express", "fastify", "koa", "@nestjs/core", "vite", "astro", "react-scripts", "@angular/core", "vue"))
      bump("saas-web", 4, "web framework dependency");
    if (has("stripe", "@stripe/stripe-js", "next-auth", "@clerk/nextjs", "@supabase/supabase-js", "prisma", "@prisma/client", "firebase"))
      bump("saas-web", 3, "auth/billing/db dependency");
  }

  const pyReq = await fs.readFile(path.join(root, "requirements.txt"), "utf8").catch(() => "");
  if (/pygame|arcade|panda3d|pyglet/i.test(pyReq)) bump("game", 6, "python game library");
  if (/django|flask|fastapi/i.test(pyReq)) bump("saas-web", 4, "python web framework");
  if (rels.has("Cargo.toml")) {
    const cargo = await fs.readFile(path.join(root, "Cargo.toml"), "utf8").catch(() => "");
    if (/\b(bevy|macroquad|ggez)\b/.test(cargo)) bump("game", 6, "rust game crate");
    if (/\b(axum|actix-web|rocket)\b/.test(cargo)) bump("saas-web", 4, "rust web crate");
  }
  if (rels.has("Gemfile") && hasRel(/^config\/routes\.rb$/)) bump("saas-web", 4, "Rails app");

  for (const type of Object.keys(KEYWORDS) as ProjectType[]) {
    const hits = KEYWORDS[type].filter((re) => re.test(readmeText)).length;
    if (hits) bump(type, hits, `${hits} README keyword group(s)`);
  }

  const ranked = (Object.entries(scores) as [ProjectType, number][]).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = ranked[0];
  const total = ranked.reduce((sum, [, s]) => sum + s, 0);
  // With no signals, a generic code repo is most commonly a web product.
  if (bestScore === 0) return { type: "saas-web", confidence: 0.2, signals: ["no signals, default"], manifestName, manifestDescription, manifestHomepage };
  return { type: bestType, confidence: Math.round((bestScore / total) * 100) / 100, signals, manifestName, manifestDescription, manifestHomepage };
}
