export interface ReadmeSection {
  title: string;
  summary: string;
}

export interface ReadmeInfo {
  title?: string;
  tagline?: string;
  /** Bullet points under a "Features"-like heading. */
  features: string[];
  /** `##` sections with a short summary; used as feature material when there is no feature list. */
  sections: ReadmeSection[];
  /** Relative image paths referenced from the README (markdown + HTML). */
  imageRefs: string[];
  /** Absolute https image URLs referenced from the README, in document order. */
  remoteImageRefs: string[];
  excerpt: string;
}

const stripMarkdown = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[`*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const FEATURE_HEADING = /^#{1,4}\s*(features?|highlights?|why\b|what you get|capabilities|özellikler|key features)/i;
const SKIP_SECTION_EXTRA =
  /(docker|railway|northflank|heroku|vercel|netlify|render\b|fly\.io|upgrad|migrat|about\b|different|note\b|warning|telemetry|trademark|disclaimer|self-?host|hosting|community|join|sponsors?|backers?|stats|analytics|thanks|hall of fame|who.?s using|used by|star|fork|issues?|pull requests?|commands?|scripts?|folder|structure|tech stack|built with|stack|rate.?limit|unkey|env|config|secret|token|api.?key|database|redis|cache|logging|debug|lint|format|translation|i18n|license|release|version|monorepo|workspace|turbo|yarn|npm|pnpm|prisma|e2e|playwright|jest|vitest)/i;
const SKIP_SECTION =
  /(install|usage|license|licen[cs]e|contribut|getting started|quick ?start|requirements?|prerequisites?|table of contents|contents|build|test|acknowledg|credits|support|faq|changelog|sponsor|badges?|setup|develop|documentation|docs|roadmap|authors?|star history|donat|code of conduct|security|contact|links|resources|translations?|run\b|deploy|configuration|environment)/i;

/** Removes fenced code blocks so shell comments like `# run this` are never mistaken for headings. */
function proseLines(markdown: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\s*(```+|~~~+)/.exec(line);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      continue;
    }
    if (!fence) out.push(line);
  }
  return out;
}

const looksLikeTitle = (t: string) => t.length >= 2 && t.length <= 50 && !/[:;]$/.test(t) && !/^(in a|run|npm|pip|git|\$)/i.test(t);

export function parseReadme(markdown: string): ReadmeInfo {
  const lines = proseLines(markdown);
  const text = lines.join("\n");

  let title: string | undefined;
  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  if (h1) title = stripMarkdown(h1.replace(/^#\s+/, ""));
  if (!title || !looksLikeTitle(title)) {
    const html = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text);
    title = html ? stripMarkdown(html[1]) : undefined;
  }
  if (title && !looksLikeTitle(title)) title = undefined;

  let tagline: string | undefined;
  const paragraph: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(#|!\[|<|\[!\[|\[!|>|\||[-*+]\s|\d+\.\s|---|===)/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  if (paragraph.length) tagline = stripMarkdown(paragraph.join(" ")).slice(0, 160) || undefined;

  const features: string[] = [];
  let inFeatures = false;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      inFeatures = FEATURE_HEADING.test(line);
      continue;
    }
    if (!inFeatures) continue;
    const m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (m) {
      const t = stripMarkdown(m[1]);
      if (t.length >= 3) features.push(t.slice(0, 120));
    }
  }

  const sections: ReadmeSection[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^##{1,2}\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    const heading = stripMarkdown(m[1]).replace(/^[^\p{L}\p{N}]+/u, "");
    if (!heading || heading.length > 32 || SKIP_SECTION.test(heading) || SKIP_SECTION_EXTRA.test(heading) || FEATURE_HEADING.test(lines[i])) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j]); j++) {
      const t = lines[j].trim();
      if (!t) {
        if (body.length) break;
        continue;
      }
      if (/^(!\[|<|\||```|>|\[!|[-*+]\s|\d+\.\s)/.test(t)) continue;
      body.push(t);
    }
    const sentence = stripMarkdown(body.join(" ").replace(/\[\]\([^)]*\)/g, "")).split(/(?<=[.!?])\s/)[0] ?? "";
    // Reject boilerplate: links, instructions ("run:"), fragments.
    if (sentence.length < 25 || sentence.length > 140 || /https?:\/\/|[:;]$|\brun\b/i.test(sentence)) continue;
    sections.push({ title: heading, summary: sentence });
  }

  // Only images from the README "hero" (before the first ## heading) or from showcase-like sections count.
  // Images further down are usually setup docs (terminal output, config screens), not the product.
  const SHOWCASE = /(screenshots?|demo|preview|gallery|showcase|features?|overview|in action|how it looks|see it|ui\b|gameplay)/i;
  const imageRefs = new Set<string>();
  let showcase = true;
  let chunk: string[] = [];
  const flush = () => {
    if (showcase) {
      const block = chunk.join("\n");
      for (const m of block.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) imageRefs.add(m[1]);
      for (const m of block.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) imageRefs.add(m[1]);
    }
    chunk = [];
  };
  for (const line of lines) {
    const h = /^#{2,6}\s+(.+)$/.exec(line);
    if (h) {
      flush();
      showcase = SHOWCASE.test(h[1]);
    }
    chunk.push(line);
  }
  flush();
  const relativeRefs = [...imageRefs]
    .filter((ref) => !/^(https?:)?\/\//i.test(ref) && !ref.startsWith("data:"))
    .map((ref) => ref.replace(/^\.\//, "").split(/[?#]/)[0]);

  const remoteImageRefs = [...imageRefs].filter((ref) => /^https:\/\//i.test(ref));

  return {
    title,
    tagline,
    features: features.slice(0, 8),
    sections: sections.slice(0, 6),
    imageRefs: relativeRefs,
    remoteImageRefs,
    excerpt: stripMarkdown(text).slice(0, 1200),
  };
}
