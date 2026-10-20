import type { Feature, Storyboard, Tone, UserIntent } from "../shared/types";
import { normalizeTheme } from "./director";

const MAX_DESCRIPTION = 300;
const MAX_KEY_FEATURE = 60;

const TONE_LABELS: Record<string, Tone> = {
  developer: "developer",
  "developer/b2b": "developer",
  b2b: "developer",
  viral: "viral",
  "viral/trendy": "viral",
  trendy: "viral",
  minimal: "minimal",
  "minimal/sade": "minimal",
  sade: "minimal",
};

export const normalizeTone = (raw: unknown): Tone | undefined => (typeof raw === "string" ? TONE_LABELS[raw.trim().toLowerCase()] : undefined);

const clean = (raw: unknown, max: number): string | undefined => {
  if (typeof raw !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[<>`]/g, "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
};

/** Trims/limits the free-text wizard answers. Returns undefined when nothing useful was provided. */
export function sanitizeIntent(raw: unknown): UserIntent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const intent: UserIntent = {
    projectDescription: clean(r.projectDescription, MAX_DESCRIPTION),
    keyFeature: clean(r.keyFeature, MAX_KEY_FEATURE),
    targetAudience: normalizeTone(r.targetAudience),
    theme: normalizeTheme(r.theme),
  };
  for (const k of Object.keys(intent) as (keyof UserIntent)[]) if (intent[k] === undefined) delete intent[k];
  return Object.keys(intent).length ? intent : undefined;
}

/** Lowercase ASCII (Turkish letters folded) so "Entegrasyonlar", "entegrasyon" and "Integrations" compare sanely. */
export const fold = (s: string) =>
  s
    .toLocaleLowerCase("en-US")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/İ/g, "i");

const GROUPS: { match: RegExp; paths: string[] }[] = [
  { match: /integrat|entegr|connect|baglan|plugin|eklenti|\bapps?\b/, paths: ["/integrations", "/apps", "/app-store", "/marketplace", "/connectors", "/plugins"] },
  { match: /\bhiz|speed|fast|perform|latenc|benchmark/, paths: ["/performance", "/speed", "/benchmarks"] },
  { match: /tasar|design|theme|tema|custom|ozellestir|brand|arayuz|\bui\b/, paths: ["/design", "/themes", "/customization", "/templates", "/showcase", "/examples"] },
  { match: /fiyat|pric|plan|cost|ucret|paket/, paths: ["/pricing", "/plans", "/prices"] },
  { match: /guven|secur|privacy|gizlilik|complian|gdpr|soc2/, paths: ["/security", "/trust", "/privacy"] },
  { match: /\bapi\b|developer|gelistirici|\bsdk\b|webhook/, paths: ["/api", "/developers", "/developer", "/api-reference", "/docs/api"] },
  { match: /analit|analytic|rapor|report|insight/, paths: ["/analytics", "/reports", "/insights"] },
  { match: /template|sablon|ornek|example|gallery/, paths: ["/templates", "/examples", "/showcase", "/gallery"] },
  { match: /\bai\b|yapay|automat|otomasyon|workflow/, paths: ["/ai", "/automation", "/workflows"] },
  { match: /mobil|mobile|\bios\b|android/, paths: ["/mobile", "/download"] },
  { match: /team|ekip|takim|collab|isbirlig/, paths: ["/teams", "/collaboration"] },
  { match: /\bdocs?\b|dokuman|belge|guide/, paths: ["/docs", "/documentation", "/guides"] },
];

/** Public sub-pages most likely to showcase the feature the user wants highlighted (static allowlist + a safe slug). */
export function keyFeaturePaths(keyFeature: string | undefined): string[] {
  if (!keyFeature) return [];
  const f = fold(keyFeature);
  const out: string[] = [];
  for (const g of GROUPS) if (g.match.test(f)) for (const p of g.paths) if (!out.includes(p)) out.push(p);
  const slug = f.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  if (slug.length >= 3) for (const p of [`/${slug}`, `/features/${slug}`]) if (!out.includes(p)) out.push(p);
  return out.slice(0, 8);
}

/** Does this feature text talk about the key feature? Prefix match so "entegrasyonlar" ~ "entegrasyon" and "integrations" ~ "integration". */
export function mentionsKeyFeature(text: string, keyFeature: string): boolean {
  const haystack = fold(text);
  const tokens = fold(keyFeature).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  return tokens.some((t) => haystack.includes(t.length > 6 ? t.slice(0, 6) : t));
}

export const TONE_GUIDE: Record<Tone, string> = {
  developer:
    "Developer / B2B: precise, technical and credible. Speak to engineers and team leads about time saved, reliability and workflow fit. Concrete nouns over adjectives; no hype words, no slang.",
  viral:
    "Viral / trendy: fast, punchy, pattern-interrupt hooks (a bold claim, a relatable frustration, a surprising contrast). Very short lines, casual voice, strong rhythm. Never clickbait that the project facts cannot back up.",
  minimal:
    "Minimal / clean: calm and understated. As few words as possible, plain language, one idea per line, generous restraint. No exclamation marks.",
};

const TONE_CTA: Record<Tone, string> = { developer: "Read the docs", viral: "Try it now", minimal: "Learn more" };

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\-–—]$/, "")}…`;
};

const titleCase = (s: string) => s.replace(/\b(\p{L})/gu, (c) => c.toLocaleUpperCase());

/**
 * Makes the user's key feature the focus of scene 1 and 2 (feature scenes) and the hook. Used on the template copy and
 * as a guard on LLM output (when the model ignored the brief). Tone only changes the call to action.
 */
export function applyIntent(stories: Storyboard[], intent: UserIntent | undefined, name: string, options: { tone?: boolean; hooks?: boolean } = {}): Storyboard[] {
  if (!intent) return stories;
  return stories.map((story, i) => {
    let { features, hook, cta } = story;
    const key = intent.keyFeature;
    if (key) {
      const title = clip(titleCase(key), 30);
      const rest = [...features];
      const found = rest.findIndex((f) => mentionsKeyFeature(`${f.title} ${f.description}`, key));
      const first: Feature =
        found >= 0 ? rest.splice(found, 1)[0] : { title, description: clip(intent.projectDescription ?? features[0]?.description ?? "", 70) };
      const foundSecond = rest.findIndex((f) => mentionsKeyFeature(`${f.title} ${f.description}`, key));
      const second: Feature =
        foundSecond >= 0
          ? rest.splice(foundSecond, 1)[0]
          : { title: clip(`${first.title}, up close`, 30), description: clip(`See how ${name} handles ${key.toLowerCase()}.`, 70) };
      features = [first, second, ...rest].slice(0, 3);
    }
    if (options.hooks !== false) {
      if (intent.projectDescription && i === 0) hook = clip(intent.projectDescription, 64);
      else if (key && i === 1) hook = clip(`${name}: ${titleCase(key)} done right.`, 64);
    }
    if (options.tone !== false && intent.targetAudience) cta = TONE_CTA[intent.targetAudience];
    return { ...story, features, hook, cta };
  });
}
