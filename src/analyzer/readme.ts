export interface ReadmeInfo {
  title?: string;
  tagline?: string;
  features: string[];
  /** Relative image paths referenced from the README (markdown + HTML). */
  imageRefs: string[];
  excerpt: string;
}

const stripMarkdown = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const FEATURE_HEADING = /^#{1,4}\s*(features?|highlights?|why\b|what you get|capabilities|özellikler|key features)/i;

export function parseReadme(markdown: string): ReadmeInfo {
  const lines = markdown.split(/\r?\n/);

  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  const title = h1 ? stripMarkdown(h1.replace(/^#\s+/, "")) : undefined;

  let tagline: string | undefined;
  let inFence = false;
  const paragraph: string[] = [];
  for (const line of lines) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(#|!\[|<|\[!\[|\||[-*]\s|---|===)/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  if (paragraph.length) tagline = stripMarkdown(paragraph.join(" ")).slice(0, 160);

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
      const text = stripMarkdown(m[1]);
      if (text.length >= 3) features.push(text.slice(0, 120));
    }
  }

  const imageRefs = new Set<string>();
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) imageRefs.add(m[1]);
  for (const m of markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) imageRefs.add(m[1]);
  const relativeRefs = [...imageRefs]
    .filter((ref) => !/^(https?:)?\/\//i.test(ref) && !ref.startsWith("data:"))
    .map((ref) => ref.replace(/^\.\//, "").split(/[?#]/)[0]);

  return {
    title,
    tagline,
    features: features.slice(0, 8),
    imageRefs: relativeRefs,
    excerpt: stripMarkdown(markdown).slice(0, 1200),
  };
}
