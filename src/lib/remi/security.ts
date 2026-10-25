// Dr.Remi -- server-only security helpers: caller fingerprint, session
// tokens, rate limits, and an SSRF-safe fetch for admin-supplied URLs.
import { createHash, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { createAdminClient } from "@/lib/supabase/admin";

export function ipHash(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.SUPABASE_JWT_SECRET || process.env.OPENAI_API_KEY?.slice(-12) || "remi";
  return createHash("sha256").update(`remi:${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function newSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(`remi-session:${token}`).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function signWebhook(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// ------------------------------------------------------------ rate limits
export type UsageKind = "turn" | "stt" | "tts" | "embed" | "session";

// Per caller (hashed IP), rolling hour. Generous enough for a busy
// exhibition kiosk (one IP, many visitors), strict enough to stop abuse.
const PER_HOUR: Record<UsageKind, number> = {
  turn: Number(process.env.REMI_TURNS_PER_HOUR || 400),
  stt: Number(process.env.REMI_STT_PER_HOUR || 400),
  tts: Number(process.env.REMI_TTS_PER_HOUR || 400),
  embed: 2000,
  session: Number(process.env.REMI_SESSIONS_PER_HOUR || 120),
};

const mem = new Map<string, number[]>();

export async function allowUsage(ip: string, kind: UsageKind, workspaceId: string | null): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("remi_usage")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip)
      .eq("kind", kind)
      .gte("created_at", since);
    if (error) throw error;
    if ((count || 0) >= PER_HOUR[kind]) return false;
    // Fire-and-forget: the log write must not add a round-trip to the customer's wait.
    void admin.from("remi_usage").insert({ ip_hash: ip, kind, workspace_id: workspaceId }).then(() => undefined, () => undefined);
    return true;
  } catch {
    const k = `${ip}:${kind}`;
    const now = Date.now();
    const hits = (mem.get(k) || []).filter((t) => now - t < 3600_000);
    if (hits.length >= Math.ceil(PER_HOUR[kind] / 2)) return false;
    hits.push(now);
    mem.set(k, hits);
    return true;
  }
}

// ------------------------------------------------------------ SSRF guard
function privateV4(ip: string) {
  const p = ip.split(".").map(Number);
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224
  );
}
function privateV6(ip: string) {
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid web address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) links are supported.");
  if (u.username || u.password) throw new Error("Links with embedded credentials are not allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("Private addresses are not allowed.");
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  for (const a of addrs) {
    if ((a.family === 4 && privateV4(a.address)) || (a.family === 6 && privateV6(a.address))) {
      throw new Error("Private or internal addresses are not allowed.");
    }
  }
  return u;
}

/** Fetch an admin-supplied public URL: no redirects to private hosts, size + time capped. */
export async function safeFetch(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; contentType: string; buffer: Buffer; finalUrl: string }> {
  let url = await assertPublicUrl(raw);
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  for (let hop = 0; hop < 4; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(url, {
        method: opts.method || "GET",
        body: opts.body,
        headers: { "User-Agent": "SimpleNow-DrRemi/1.0 (+https://simplenow.ai)", ...(opts.headers || {}) },
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
        continue;
      }
      const reader = res.body?.getReader();
      const parts: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            controller.abort();
            throw new Error("That page or file is too large.");
          }
          parts.push(value);
        }
      }
      return {
        status: res.status,
        contentType: res.headers.get("content-type") || "",
        buffer: Buffer.concat(parts.map((p) => Buffer.from(p))),
        finalUrl: url.toString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects.");
}
