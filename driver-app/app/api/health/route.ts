import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    firebase_service_account: !!process.env.FIREBASE_SERVICE_ACCOUNT_B64,
    firebase_storage_bucket: !!process.env.FIREBASE_STORAGE_BUCKET,
    ringcentral_client_id: !!process.env.RINGCENTRAL_CLIENT_ID,
    ringcentral_client_secret: !!process.env.RINGCENTRAL_CLIENT_SECRET,
    ringcentral_jwt: !!process.env.RINGCENTRAL_JWT_TOKEN,
    ringcentral_from: !!process.env.RINGCENTRAL_FROM_NUMBER,
    ringcentral_dispatch_numbers: !!process.env.RINGCENTRAL_DISPATCH_NUMBERS,
  };

  const required = ["anthropic", "firebase_service_account", "firebase_storage_bucket"];
  const missingRequired = required.filter((k) => !checks[k as keyof typeof checks]);

  return NextResponse.json({
    ok: missingRequired.length === 0,
    timestamp: new Date().toISOString(),
    checks,
    missingRequired,
    note: missingRequired.length > 0
      ? "Required env vars missing — submission will fail"
      : "All critical env vars set",
  }, {
    status: missingRequired.length === 0 ? 200 : 503,
  });
}
