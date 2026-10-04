/**
 * Shared request guards for the public API routes.
 *
 * Edge-runtime safe: no Node built-ins, no Firebase Admin SDK.
 *
 * These endpoints are reachable by anyone on the internet and spend money on every
 * call (Anthropic tokens, Firestore writes, SMS). None of them has a user session to
 * authenticate against, so the controls here are about raising cost and bounding
 * blast radius, not about identity.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://apply.gosquare.net",
  "https://gosquare.net",
  "https://www.gosquare.net",
];

function allowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origins = configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
  // Vercel preview deployments get a generated hostname; allow them only outside
  // production so a preview build stays testable without widening production.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    const previewUrl = process.env.VERCEL_URL;
    if (previewUrl) origins.push(`https://${previewUrl}`);
    origins.push("http://localhost:3000");
  }
  return origins;
}

/**
 * Reject requests that did not originate from our own pages.
 *
 * This is not a security boundary on its own — Origin is set by the browser and a
 * non-browser client simply omits or forges it. It cheaply eliminates the casual
 * cross-site abuse that makes up most of the volume, and it costs one header read.
 * The rate limiter is what bounds a determined caller.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const allowed = allowedOrigins();

  if (origin) return allowed.includes(origin);

  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  // No Origin and no Referer: a direct non-browser call. Reject — our own fetches
  // always carry one of the two.
  return false;
}

export function forbidden(message = "Request not permitted from this origin") {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Models this application is permitted to call. The model was previously taken from
 * the request body, which let an anonymous caller bill the company's Anthropic
 * account for the most expensive model available.
 */
const MODEL_ALLOWLIST = new Set([
  "claude-haiku-4-5-20251001",
]);

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function resolveModel(requested: unknown): string {
  if (typeof requested === "string" && MODEL_ALLOWLIST.has(requested)) return requested;
  return DEFAULT_MODEL;
}

/**
 * Bound the conversation sent upstream. Without a cap, a caller can post a
 * multi-megabyte message array and turn one request into a very large bill.
 */
export const MAX_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 4000;

export function sanitiseMessages(messages: unknown): { role: string; content: string }[] | null {
  if (!Array.isArray(messages)) return null;
  if (messages.length === 0 || messages.length > MAX_MESSAGES) return null;

  const out: { role: string; content: string }[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return null;
    const role = (m as any).role;
    const content = (m as any).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  return out;
}

/**
 * In-memory fixed-window limiter for edge routes, which cannot reach the Firebase
 * Admin SDK.
 *
 * Caveat, stated plainly: edge instances do not share memory, so this caps a single
 * instance rather than the whole deployment. It blunts a naive loop from one client;
 * it does not stop a distributed one. The Firestore limiter in lib/rate-limit.ts is
 * the real control, and it guards the expensive endpoint (/api/submit).
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function edgeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup so the map cannot grow without bound on a warm instance.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}
