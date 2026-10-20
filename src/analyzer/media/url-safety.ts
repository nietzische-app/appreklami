import { promises as dns } from "node:dns";
import net from "node:net";

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses (v4 + v6). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateIp(mapped[1]);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

const hostCache = new Map<string, boolean>();

/** Resolves the host and requires every address to be public (blocks SSRF to internal services). */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const cached = hostCache.get(host);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    if (net.isIP(host)) ok = !isPrivateIp(host);
    else if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) ok = false;
    else {
      const addrs = await dns.lookup(host, { all: true });
      ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
    }
  } catch {
    ok = false;
  }
  hostCache.set(host, ok);
  return ok;
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

export async function isSafePublicUrl(raw: string): Promise<boolean> {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.username || u.password || !ALLOWED_PORTS.has(u.port)) return false;
    return await isPublicHost(u.hostname);
  } catch {
    return false;
  }
}
