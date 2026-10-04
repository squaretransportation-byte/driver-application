import { db } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

/**
 * Firestore-backed fixed-window rate limiter.
 *
 * Serverless functions do not share memory, so an in-process counter resets every
 * cold start and is trivially defeated by concurrency. This limiter keeps counts in
 * Firestore so every instance sees the same window.
 *
 * Counters live in `rateLimits/{bucket}` and are cheap: one transaction per call.
 * Set a Firestore TTL policy on the `expiresAt` field of the `rateLimits`
 * collection so old windows are reaped automatically:
 *
 *   gcloud firestore fields ttls update expiresAt \
 *     --collection-group=rateLimits --enable-ttl
 */

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

function bucketId(scope: string, identifier: string, windowSeconds: number): string {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  // Firestore document IDs cannot contain "/" and are capped at 1500 bytes.
  const safeIdentifier = identifier.replace(/\//g, "_").slice(0, 200) || "unknown";
  return `${scope}__${safeIdentifier}__${window}`;
}

/**
 * Consume one unit against a bucket. Fails OPEN on infrastructure error — a
 * Firestore outage should not take the application form offline, and the other
 * controls (origin check, provider-side SMS spend cap) still apply.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const id = bucketId(scope, identifier, windowSeconds);
  const ref = db().collection("rateLimits").doc(id);

  try {
    const count = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data()?.count as number) || 0 : 0;
      const next = current + 1;

      tx.set(
        ref,
        {
          count: FieldValue.increment(1),
          scope,
          expiresAt: Timestamp.fromMillis(Date.now() + windowSeconds * 2000),
        },
        { merge: true }
      );

      return next;
    });

    return {
      allowed: count <= limit,
      count,
      limit,
      retryAfterSeconds: windowSeconds,
    };
  } catch (e: any) {
    console.error("[rate-limit] check failed, failing open:", e?.message || "unknown error");
    return { allowed: true, count: 0, limit, retryAfterSeconds: 0 };
  }
}

/**
 * Pull the best available client identifier from request headers.
 * x-forwarded-for on Vercel is a comma-separated list; the first entry is the
 * client. Falls back to a constant so a missing header degrades to a global
 * limit rather than to no limit at all.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}
