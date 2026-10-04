import { NextRequest, NextResponse } from "next/server";
import { originAllowed, forbidden } from "@/lib/api-guard";

/**
 * Outer gate for the public API surface.
 *
 * Every route under /api costs money when called — Anthropic tokens, Firestore
 * writes, Storage uploads, RingCentral SMS — and none of them has a user session to
 * authenticate. Rejecting cross-origin POSTs here means an abusive caller is turned
 * away before a route handler runs.
 *
 * Each route repeats the origin check for itself. That duplication is intentional:
 * middleware matchers are easy to get wrong, and a route that depends on middleware
 * it is not actually covered by is an open endpoint that looks closed.
 *
 * /api/health is exempt so uptime monitoring works without an Origin header.
 */
export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204 });
  }

  // Only mutating calls are gated; GETs on these routes return nothing sensitive.
  if (req.method !== "POST") return NextResponse.next();

  if (!originAllowed(req)) {
    return forbidden();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/submit", "/api/chat", "/api/interview/:path*"],
};
