/**
 * Decides which pages of a live site are worth filming. Login/sign-up screens say nothing about the product, so they
 * are rejected by URL and by what is actually rendered; public showcase pages and product imagery are preferred.
 */

const AUTH_PATH = /(^|\/)(log-?in|sign-?in|sign-?up|sign-?on|register|auth|oauth2?|sso|authenticate|account\/(login|signin))(\/|$)/i;
const AUTH_HOST = /^(login|signin|auth|accounts|sso|id|identity)\./i;
const APP_SUBDOMAIN = /^(app|dashboard|console|my|portal|account|admin|cloud|studio)$/i;

/** Public pages that explain the product, in the order they are tried. */
export const SHOWCASE_PATHS = ["/", "/features", "/product", "/solutions", "/docs"];

export function isAuthUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return AUTH_PATH.test(u.pathname) || AUTH_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Pages to try for a product URL. App subdomains (app.example.com) are normally the login wall, so the marketing apex
 * domain is tried first. The original URL always stays in the list; auth URLs never do.
 */
export function candidateUrls(liveUrl: string, max = 7): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    if (!isAuthUrl(u) && !out.includes(u)) out.push(u);
  };
  let base: URL;
  try {
    base = new URL(liveUrl);
  } catch {
    return [];
  }
  const labels = base.hostname.split(".");
  const origins: string[] = [];
  if (labels.length >= 3 && APP_SUBDOMAIN.test(labels[0])) origins.push(`${base.protocol}//${labels.slice(1).join(".")}`);
  origins.push(base.origin);

  if (base.pathname.length > 1) add(base.toString());
  for (const origin of origins) for (const p of SHOWCASE_PATHS) add(`${origin}${p}`);
  return out.slice(0, max);
}

export interface PageProbe {
  /** Visible password inputs. */
  pw: number;
  /** Visible e-mail / username inputs. */
  email: number;
  textLen: number;
  /** "Sign in", "Welcome back", "Forgot password", "Continue with Google" ... near the top of the page. */
  loginWords: boolean;
  /** Share of the viewport covered by the largest visible form (0..1). */
  formRatio: number;
  headings: number;
  scrollHeight: number;
  vh: number;
}

/** Runs inside the page (passed as a string: transpiled closures reference helpers that do not exist there). */
export const PROBE_SCRIPT = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const inputs = [...document.querySelectorAll('input')].filter(vis);
  const pw = inputs.filter((i) => i.type === 'password').length;
  const email = inputs.filter((i) => (i.type === 'email' || i.type === 'text') && /mail|user|login|identifier/i.test(i.name + ' ' + i.id + ' ' + i.autocomplete + ' ' + i.placeholder)).length;
  const text = (document.body && document.body.innerText) || '';
  const area = Math.max(1, innerWidth * innerHeight);
  let formRatio = 0;
  for (const f of document.querySelectorAll('form')) {
    if (!vis(f)) continue;
    const r = f.getBoundingClientRect();
    formRatio = Math.max(formRatio, (Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight)) / area);
  }
  return {
    pw, email, textLen: text.length,
    loginWords: /(sign in|log in|login|welcome back|forgot (your )?password|continue with (google|github|email|apple))/i.test(text.slice(0, 4000)),
    formRatio,
    headings: document.querySelectorAll('h1,h2,h3').length,
    scrollHeight: document.documentElement.scrollHeight,
    vh: innerHeight,
  };
})()`;

/** A near-empty page (profile stub, "coming soon", one-line redirect target): not worth filming unless nothing better exists. */
export function isThinPage(p: PageProbe): boolean {
  return p.textLen < 700 || p.scrollHeight < p.vh * 1.5;
}

/** True when the rendered page is dominated by a sign-in/sign-up form. */
export function isLoginPage(p: PageProbe): boolean {
  if (p.pw > 0) {
    const longContentPage = p.textLen >= 3000 && p.scrollHeight >= p.vh * 3 && p.formRatio < 0.35;
    return !longContentPage;
  }
  if (p.email > 0 && p.loginWords && p.textLen < 1200) return true;
  return p.loginWords && p.textLen < 400 && p.headings <= 2 && p.formRatio > 0.1;
}

export interface ImageStats {
  /** Standard deviation of luminance (0..255) on a 96px-wide thumbnail. */
  lumStd: number;
  /** Mean absolute luminance gradient between neighbouring pixels. */
  edge: number;
}

/** Computes ImageStats in a blank page from a data: URL (so the canvas is never tainted). */
export const imageStatsScript = (dataUrl: string) => `new Promise((resolve) => {
  const img = new Image();
  img.onerror = () => resolve(null);
  img.onload = () => {
    const w = 96, h = Math.max(8, Math.round(96 * img.naturalHeight / img.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i++) { lum[i] = 0.2126 * d[i*4] + 0.7152 * d[i*4+1] + 0.0722 * d[i*4+2]; sum += lum[i]; }
    const mean = sum / (w * h);
    let v = 0, e = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = lum[y*w+x]; v += (l - mean) * (l - mean);
      if (x + 1 < w) { e += Math.abs(l - lum[y*w+x+1]); n++; }
      if (y + 1 < h) { e += Math.abs(l - lum[(y+1)*w+x]); n++; }
    }
    resolve({ lumStd: Math.sqrt(v / (w * h)), edge: e / n });
  };
  img.src = ${JSON.stringify(dataUrl)};
})`;

/** Soft gradients, faint grids and blobs have almost no contrast; real UI screenshots have text and panels. */
export function looksDecorative(stats: ImageStats | null): boolean {
  return !!stats && (stats.lumStd < 14 || stats.edge < 1.2);
}

export interface PageImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

const NOISE = /(logo|icon|avatar|sprite|badge|flag|favicon|payment|partner|customer|brand|testimonial|trusted|sponsor|client|emoji|gravatar|qr|login|sign-?in|pattern|texture|noise|shadow|spinner|loader|background|(^|[-_/ ])bg([-_. ]|$)|grid|gradient|blob|shape|overlay|decor|divider|wave|glow|mesh)/i;
const HINT = /(dashboard|screenshot|screen-shot|screen|app|product|demo|hero|ui|preview|interface|mockup|feature|overview|booking|calendar|editor|board|analytics|workflow)/i;

/** Higher = more likely to be a real product screenshot. Returns 0 for images that should not be used. */
export function scoreShowcaseImage(img: PageImage): number {
  if (img.width < 700 || img.height < 350) return 0;
  const aspect = img.width / img.height;
  if (aspect > 3.2 || aspect < 0.3) return 0;
  const label = `${decodeURIComponent(img.src.split("?")[0].split("/").pop() ?? "")} ${img.alt}`;
  if (NOISE.test(label)) return 0;
  if (/\.svg(\?|$)/i.test(img.src)) return 0;
  const area = Math.min((img.width * img.height) / 1_000_000, 4);
  return area + (HINT.test(label) ? 3 : 0);
}

/** Smooth, continuous page scroll for `ms`; bounces back to the top at the bottom so the motion never stops. */
export const smoothScrollScript = (ms: number) => `new Promise((resolve) => {
  const end = performance.now() + ${Math.round(ms)};
  let down = true;
  const step = () => {
    if (performance.now() >= end) return resolve();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (down && window.scrollY >= max - 4) down = false;
    else if (!down && window.scrollY <= 4) down = true;
    if (max < 40) return setTimeout(step, 400);
    window.scrollBy({ top: down ? 500 : -900, behavior: 'smooth' });
    setTimeout(step, 750);
  };
  step();
})`;
