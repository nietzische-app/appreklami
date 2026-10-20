/** Hosts that are never "the product" (code hosts, badges, social, deploy buttons, package registries...). */
const BLOCKED_HOST =
  /(^|\.)(github\.com|githubusercontent\.com|gitlab\.com|bitbucket\.org|npmjs\.com|npmjs\.org|pypi\.org|crates\.io|shields\.io|badgen\.net|codecov\.io|coveralls\.io|travis-ci\.(org|com)|circleci\.com|twitter\.com|x\.com|facebook\.com|linkedin\.com|youtube\.com|youtu\.be|discord\.(gg|com)|slack\.com|t\.me|reddit\.com|medium\.com|dev\.to|producthunt\.com|opencollective\.com|patreon\.com|ko-fi\.com|buymeacoffee\.com|paypal\.com|stackblitz\.com|codesandbox\.io|gitpod\.io|codespaces\.new|railway\.app|render\.com|heroku\.com|fly\.io|netlify\.com|vercel\.com|app\.netlify\.com|deploy\.workers\.cloudflare\.com|digitalocean\.com|northflank\.com|docker\.com|hub\.docker\.com|crowdin\.com|weblate\.org|wikipedia\.org|w3\.org|creativecommons\.org|opensource\.org|apache\.org|gnu\.org|mozilla\.org|nodejs\.org|reactjs\.org|react\.dev|typescriptlang\.org|apps\.apple\.com|play\.google\.com|itunes\.apple\.com)$/i;
const FILE_EXT = /\.(png|jpe?g|gif|webp|svg|md|pdf|zip|tar|gz|json|ya?ml|txt|mp4|webm)(\?|#|$)/i;
const LABEL_HINT = /(live demo|demo|website|web site|try it|try now|visit|playground|open app|launch|app|play now|play|homepage|official site|get started)/i;

export interface LiveUrlInput {
  readme: string;
  packageHomepage?: string;
  /** Repo/project name used to prefer matching domains (cal.com for "Cal.com"). */
  name?: string;
}

const normalize = (raw: string): string | undefined => {
  try {
    const u = new URL(raw.replace(/[).,;:'"]+$/, ""));
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (BLOCKED_HOST.test(u.hostname) || FILE_EXT.test(u.pathname)) return undefined;
    if (!u.hostname.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return undefined;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return undefined;
  }
};

/** Finds the most likely public product URL: package.json homepage first, then README links ranked by label/position. */
export function findLiveUrl({ readme, packageHomepage, name }: LiveUrlInput): string | undefined {
  const scores = new Map<string, number>();
  const add = (raw: string, score: number) => {
    const url = normalize(raw);
    if (url) scores.set(url, (scores.get(url) ?? 0) + score);
  };
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (packageHomepage) add(packageHomepage, 10);

  const lines = readme.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const early = idx < 60 ? 2 : 0;
    for (const m of line.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g)) {
      add(m[2], 2 + early + (LABEL_HINT.test(m[1]) ? 5 : 0));
    }
    for (const m of line.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      add(m[1], 2 + early + (LABEL_HINT.test(m[2]) ? 5 : 0));
    }
    for (const m of line.matchAll(/(?<![(\["'=])(https?:\/\/[^\s)>"'\]]+)/g)) add(m[1], 1 + early);
  });

  const ranked = [...scores.entries()].map(([url, score]) => {
    const host = new URL(url).hostname.replace(/^www\./, "");
    let s = score;
    if (slug && host.replace(/[^a-z0-9]/g, "").includes(slug)) s += 4;
    if (/^(docs|doc|developer|developers|api|status|blog|help|support|wiki)\./i.test(host)) s -= 4;
    if (new URL(url).pathname.length > 1) s -= 1;
    return { url, score: s };
  });
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return best && best.score >= 4 ? best.url : undefined;
}
