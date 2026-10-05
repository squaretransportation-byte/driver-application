import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { pushToSquareSchedule, recordSyncOutcome } from "@/lib/squareschedule";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backfill and retry endpoint.
 *
 * Re-pushes applications from this portal's Firestore into SquareSchedule. Two
 * uses:
 *   1. Backfill — applications submitted before the sync existed at all. Every
 *      application taken before 2026-10-05 is in this category, including
 *      STS-20261005-SOVTYSIK-UFNUQ9.
 *   2. Retry — applications whose push failed (`sync.ok === false`).
 *
 * Safe to run repeatedly: the ingest endpoint is idempotent on applicationId and
 * will not pull an already-approved or rejected applicant back into the queue.
 *
 * GET  /api/resync?dry=1   — report what would be sent, send nothing
 * POST /api/resync         — send
 *
 * Both require the same INGEST_SECRET as a bearer-style header. This is an admin
 * tool, not a product surface.
 *
 *   curl -X POST https://apply.gosquare.net/api/resync \
 *     -H "x-ingest-secret: $INGEST_SECRET"
 *
 * Query/body options:
 *   applicationId  one specific application
 *   all=1          include applications already synced (default: only unsynced/failed)
 *   limit          cap per run (default 50)
 */

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorise(req: NextRequest): boolean {
  const provided = (req.headers.get("x-ingest-secret") || "").trim();
  const expected = (process.env.INGEST_SECRET || "").trim();
  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

async function collect(opts: { applicationId?: string; all: boolean; limit: number }) {
  const col = db().collection("driverApplications");

  if (opts.applicationId) {
    const snap = await col.doc(opts.applicationId).get();
    return snap.exists ? [{ id: snap.id, data: snap.data() as any }] : [];
  }

  // No composite index needed: read recent applications and filter in memory.
  // Volume here is tens of documents, not thousands.
  const snap = await col.orderBy("meta.submittedAt", "desc").limit(500).get();

  const rows = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as any }))
    .filter((r) => (opts.all ? true : r.data?.sync?.ok !== true));

  return rows.slice(0, opts.limit);
}

export async function GET(req: NextRequest) {
  if (!authorise(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const rows = await collect({
    applicationId: sp.get("applicationId") || undefined,
    all: sp.get("all") === "1",
    limit: Number(sp.get("limit")) || 50,
  });

  return NextResponse.json({
    dryRun: true,
    count: rows.length,
    applications: rows.map((r) => ({
      applicationId: r.data?.applicationId || r.id,
      name: r.data?.driver?.fullName || "",
      submittedAt: r.data?.meta?.submittedAt?.toDate?.()?.toISOString?.() || null,
      syncedAlready: r.data?.sync?.ok === true,
      lastError: r.data?.sync?.lastError || null,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!authorise(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const sp = req.nextUrl.searchParams;

  const rows = await collect({
    applicationId: body.applicationId || sp.get("applicationId") || undefined,
    all: body.all === true || sp.get("all") === "1",
    limit: Number(body.limit || sp.get("limit")) || 50,
  });

  const results: any[] = [];
  for (const row of rows) {
    const applicationId = row.data?.applicationId || row.id;
    const outcome = await pushToSquareSchedule(row.data, applicationId);
    await recordSyncOutcome(applicationId, outcome);
    results.push({
      applicationId,
      ok: outcome.ok,
      status: outcome.status ?? null,
      error: outcome.error ?? null,
    });
    // Sequential, with a small gap — the ingest endpoint rate-limits at 30/min
    // per IP and a burst would start getting 429s partway through a backfill.
    await new Promise((r) => setTimeout(r, 300));
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    attempted: results.length,
    succeeded: results.length - failed,
    failed,
    results,
  });
}
