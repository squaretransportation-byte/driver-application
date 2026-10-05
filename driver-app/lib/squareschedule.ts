import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Push a completed application into SquareSchedule.
 *
 * The two systems are separate deployments with separate Firebase projects.
 * This portal stores the application and the DQF PDF; SquareSchedule is the
 * system of record for recruiting and is where a human actually reviews and
 * approves the applicant.
 *
 * Until this existed, an applicant could finish the whole form, get a reference
 * number, and never appear in SquareSchedule — which is what happened to
 * STS-20261005-SOVTYSIK-UFNUQ9.
 *
 * Failure here must never fail the submission. The applicant has already
 * certified and signed; losing their work because an internal system is down
 * would be the worse outcome. A failed push is recorded on the application
 * document so /api/resync can retry it later.
 */

export type SyncOutcome = {
  ok: boolean;
  status?: number;
  error?: string;
  skipped?: boolean;
};

const INGEST_PATH = "/api/ingest-application";

/**
 * Resolve the ingest endpoint.
 *
 * SQUARESCHEDULE_INGEST_URL is the variable already configured on this project
 * and is preferred. It may hold either the full endpoint or just the origin, so
 * both are accepted — a trailing-slash or missing-path mismatch here would fail
 * silently on every submission, which is the failure mode this whole change
 * exists to remove.
 */
function endpoint(): string | null {
  const raw = (process.env.SQUARESCHEDULE_INGEST_URL || process.env.SQUARESCHEDULE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return null;
  return raw.endsWith(INGEST_PATH) ? raw : `${raw}${INGEST_PATH}`;
}

/**
 * Build the payload SquareSchedule's ingest endpoint expects.
 *
 * The SSN is NOT included — not even encrypted. SquareSchedule has no use for
 * it; a recruiter matching an MVR or Clearinghouse result needs the last four,
 * which `driver.ssnLast4` already carries. Sending the full value would put the
 * same plaintext in a second database and widen the blast radius for nothing.
 */
export function buildSyncPayload(docData: any, applicationId: string) {
  const { _encrypted, ...safe } = docData || {};
  return {
    applicationId,
    submittedAt: new Date().toISOString(),
    ...safe,
  };
}

export async function pushToSquareSchedule(
  docData: any,
  applicationId: string
): Promise<SyncOutcome> {
  const url = endpoint();
  const secret = (process.env.INGEST_SECRET || "").trim();

  if (!url || !secret) {
    console.warn(
      "[sync] SQUARESCHEDULE_INGEST_URL or INGEST_SECRET is not set — application stored locally only"
    );
    return { ok: false, skipped: true, error: "not configured" };
  }

  // Bounded so a hanging internal service cannot hold the submit handler open
  // until the function times out and the applicant sees a failure.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": secret,
      },
      body: JSON.stringify(buildSyncPayload(docData, applicationId)),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[sync] ingest returned ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    return { ok: true, status: res.status };
  } catch (e: any) {
    const error = e?.name === "AbortError" ? "timeout after 10s" : e?.message || "unknown error";
    console.error(`[sync] ingest failed: ${error}`);
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record the outcome on the application document so a failed push is visible
 * and retryable rather than silently lost. /api/resync reads `sync.ok`.
 */
export async function recordSyncOutcome(
  applicationId: string,
  outcome: SyncOutcome
): Promise<void> {
  try {
    await db()
      .collection("driverApplications")
      .doc(applicationId)
      .set(
        {
          sync: {
            ok: !!outcome.ok,
            lastAttemptAt: Timestamp.now(),
            lastStatus: outcome.status ?? null,
            lastError: outcome.error ?? null,
            target: endpoint(),
          },
        },
        { merge: true }
      );
  } catch (e: any) {
    // Best effort. The application itself is already saved.
    console.error(`[sync] could not record outcome: ${e?.message || "unknown error"}`);
  }
}
