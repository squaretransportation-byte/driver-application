/**
 * RingCentral SMS sender — JWT auth flow.
 * Required env vars:
 *   RINGCENTRAL_CLIENT_ID
 *   RINGCENTRAL_CLIENT_SECRET
 *   RINGCENTRAL_JWT_TOKEN          (long-lived JWT from RingCentral admin portal)
 *   RINGCENTRAL_FROM_NUMBER        (your RingCentral DID)
 *   RINGCENTRAL_DISPATCH_NUMBERS   (comma-separated list of recipients)
 *   RINGCENTRAL_SERVER             (optional, defaults to https://platform.ringcentral.com)
 */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const jwtToken = process.env.RINGCENTRAL_JWT_TOKEN;
  const server = process.env.RINGCENTRAL_SERVER || "https://platform.ringcentral.com";

  if (!clientId || !clientSecret || !jwtToken) {
    throw new Error("RingCentral credentials missing in env vars");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwtToken,
  });

  const res = await fetch(`${server}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RingCentral auth failed (${res.status}): ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export async function sendSMS(to: string[], text: string): Promise<{ ok: boolean; results: any[] }> {
  const fromNumber = process.env.RINGCENTRAL_FROM_NUMBER;
  const server = process.env.RINGCENTRAL_SERVER || "https://platform.ringcentral.com";

  if (!fromNumber) throw new Error("RINGCENTRAL_FROM_NUMBER not set");
  if (!to || to.length === 0) return { ok: true, results: [] };

  const token = await getAccessToken();
  const results: any[] = [];

  for (const recipient of to) {
    try {
      const res = await fetch(
        `${server}/restapi/v1.0/account/~/extension/~/sms`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: { phoneNumber: fromNumber },
            to: [{ phoneNumber: recipient }],
            text: text.slice(0, 1000),
          }),
        }
      );
      const data = await res.json();
      results.push({ recipient, ok: res.ok, status: res.status, id: data.id, error: !res.ok ? data : undefined });
    } catch (e: any) {
      results.push({ recipient, ok: false, error: e.message });
    }
  }

  return { ok: results.every((r) => r.ok), results };
}

export async function notifyNewApplication(data: {
  applicationId: string;
  driverName: string;
  driverPhone: string;
  position: string;
  pdfUrl: string;
}): Promise<{ ok: boolean; results: any[] } | null> {
  const recipients = (process.env.RINGCENTRAL_DISPATCH_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.warn("[ringcentral] No RINGCENTRAL_DISPATCH_NUMBERS configured — skipping SMS");
    return null;
  }

  const message = [
    `🚛 NEW DRIVER APPLICATION`,
    ``,
    `Name: ${data.driverName}`,
    `Phone: ${data.driverPhone}`,
    `Position: ${data.position}`,
    `App ID: ${data.applicationId}`,
    ``,
    `DQF: ${data.pdfUrl}`,
  ].join("\n");

  return sendSMS(recipients, message);
}
