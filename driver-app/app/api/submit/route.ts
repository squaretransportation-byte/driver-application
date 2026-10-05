import { NextRequest, NextResponse } from "next/server";
import { db, uploadDataUrl, uploadBuffer } from "@/lib/firebase-admin";
import { generateDqfPdf } from "@/lib/pdf-generator";
import { notifyNewApplication } from "@/lib/ringcentral";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { encryptField, encryptionAvailable, redactSSN } from "@/lib/field-crypto";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { createHash } from "crypto";
import { pushToSquareSchedule, recordSyncOutcome } from "@/lib/squareschedule";

// Node runtime required for Firebase Admin SDK and pdf-lib
export const runtime = "nodejs";
export const maxDuration = 60;

// Submitting an application writes to Firestore, uploads to Storage, and sends SMS
// to the dispatch team on the company RingCentral account. Each of those costs money
// and none of them should be reachable at volume by an anonymous caller.
const RATE_LIMITS = {
  // 3 submissions per IP per hour. A legitimate applicant submits once.
  perIp: { limit: 3, windowSeconds: 60 * 60 },
  // 2 submissions per phone number per day — catches a distributed retry loop that
  // rotates IPs but reuses contact details.
  perPhone: { limit: 2, windowSeconds: 60 * 60 * 24 },
  // Global ceiling. 42 trailers do not generate 60 applications an hour; if this
  // trips, something is wrong and the SMS bill is the thing being protected.
  global: { limit: 60, windowSeconds: 60 * 60 },
};

function generateApplicationId(lastName: string): string {
  const ts = new Date();
  const yyyymmdd =
    ts.getFullYear().toString() +
    String(ts.getMonth() + 1).padStart(2, "0") +
    String(ts.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const lastClean = (lastName || "DRIVER")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 8) || "DRIVER";
  return `STS-${yyyymmdd}-${lastClean}-${rand}`;
}

/**
 * Mirrors the client-side disqualification rule in page.tsx. A "Yes" to any of the
 * three Part 382 questions is a self-reported disqualifying event under
 * 49 CFR 382.501 until a SAP return-to-duty process is documented.
 *
 * This is computed SERVER-SIDE and persisted. The client-side flag is advisory and
 * can be bypassed by anyone who opens devtools; this one cannot.
 */
function computeDisqualified(data: any): boolean {
  return (
    data?.daRefused === "Yes" ||
    data?.daPositive === "Yes" ||
    data?.daPreEmpPositive === "Yes"
  );
}

export async function POST(req: NextRequest) {
  let stage = "init";
  try {
    stage = "parse";
    const body = await req.json();
    const { data, files, signature } = body;

    if (!data || !data.firstName || !data.lastName) {
      return NextResponse.json(
        { error: "Missing required fields: firstName, lastName" },
        { status: 400 }
      );
    }

    // ============== RATE LIMIT ==============
    // Checked after parsing so we can key on the phone number, before any write,
    // upload, PDF render or SMS.
    stage = "rate-limit";
    const ip = clientIp(req.headers);
    const phoneKey = String(data.phone || "").replace(/\D/g, "") || "no-phone";

    const [ipLimit, phoneLimit, globalLimit] = await Promise.all([
      checkRateLimit("submit:ip", ip, RATE_LIMITS.perIp.limit, RATE_LIMITS.perIp.windowSeconds),
      checkRateLimit("submit:phone", phoneKey, RATE_LIMITS.perPhone.limit, RATE_LIMITS.perPhone.windowSeconds),
      checkRateLimit("submit:global", "all", RATE_LIMITS.global.limit, RATE_LIMITS.global.windowSeconds),
    ]);

    const blocked = [ipLimit, phoneLimit, globalLimit].find((r) => !r.allowed);
    if (blocked) {
      console.warn(`[submit] rate limited ip=${ip} scope=${blocked.limit}/${blocked.retryAfterSeconds}s`);
      return NextResponse.json(
        { error: "Too many submissions. Call dispatch at (773) 747-8436 if you need help." },
        { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } }
      );
    }

    // Refuse to proceed if we would have to store an SSN in plaintext.
    stage = "crypto-preflight";
    if (data.ssn && !encryptionAvailable()) {
      console.error("[submit] PII_ENCRYPTION_KEY missing — refusing to store SSN");
      return NextResponse.json(
        { error: "Server is not configured to accept this submission securely. Please call dispatch." },
        { status: 503 }
      );
    }

    stage = "id";
    const applicationId = generateApplicationId(data.lastName);
    const driverName = `${data.firstName} ${data.middleName || ""} ${data.lastName}`.trim().replace(/\s+/g, " ");

    // ============== UPLOAD FILES ==============
    stage = "upload-files";
    const fileUrls: Record<string, { url: string; name: string; size: number }> = {};
    if (files && typeof files === "object") {
      for (const [key, file] of Object.entries(files as Record<string, any>)) {
        if (!file || !file.dataUrl) continue;
        try {
          const ext = (file.name?.split(".").pop() || "bin").toLowerCase();
          const destPath = `applications/${applicationId}/uploads/${key}.${ext}`;
          const url = await uploadDataUrl(file.dataUrl, destPath);
          fileUrls[key] = { url, name: file.name, size: file.size };
        } catch (e: any) {
          console.error(`[submit] Failed to upload ${key}:`, e.message);
          fileUrls[key] = { url: "", name: file.name, size: file.size, ...({ error: e.message } as any) };
        }
      }
    }

    // ============== UPLOAD SIGNATURE ==============
    stage = "upload-signature";
    let signatureUrl = "";
    if (signature && signature.startsWith("data:image/")) {
      try {
        signatureUrl = await uploadDataUrl(signature, `applications/${applicationId}/signature.png`);
      } catch (e: any) {
        console.error("[submit] Signature upload failed:", e.message);
      }
    }

    // ============== GENERATE PDF ==============
    stage = "pdf";
    let pdfUrl = "";
    try {
      const pdfBytes = await generateDqfPdf(data, applicationId, signature);
      pdfUrl = await uploadBuffer(
        Buffer.from(pdfBytes),
        `applications/${applicationId}/dqf.pdf`,
        "application/pdf"
      );
    } catch (e: any) {
      console.error("[submit] PDF generation failed:", e.message);
    }

    // ============== WRITE TO FIRESTORE ==============
    stage = "firestore";
    const isDisqualified = computeDisqualified(data);
    const docData = {
      applicationId,
      status: isDisqualified ? "needs_review" : "submitted",
      driver: {
        firstName: data.firstName,
        middleName: data.middleName || "",
        lastName: data.lastName,
        fullName: driverName,
        dob: data.dob || "",
        ssnLast4: redactSSN(data.ssn || ""),
        email: data.email || "",
        phone: data.phone || "",
        position: data.position || "",
        dateAvailable: data.dateAvailable || "",
        legalRight: data.legalRight || "",
      },
      license: {
        state: data.licenseState || "",
        number: data.licenseNumber || "",
        class: data.licenseClass || "",
        endorsements: data.licenseEndorsements || "",
        expiration: data.licenseExpiration || "",
      },
      medicalCard: {
        expiration: data.medCardExpiration || "",
      },
      residences: data.residences || [],
      experience: data.experience || [],
      record: {
        noAccidents: !!data.noAccidents,
        accidents: data.accidents || [],
        noConvictions: !!data.noConvictions,
        convictions: data.convictions || [],
        everDeniedLicense: data.everDeniedLicense || "",
        everSuspended: data.everSuspended || "",
        everConvictedCMV: data.everConvictedCMV || "",
        everConvictedLaw: data.everConvictedLaw || "",
        complianceExplain: data.complianceExplain || "",
      },
      employers: data.employers || [],
      drugAlcohol: {
        refused: data.daRefused || "",
        positive: data.daPositive || "",
        preEmpPositive: data.daPreEmpPositive || "",
        explanation: data.daExplain || "",
      },
      hoursOfService: {
        totalPast7Days: data.hosTotal || "",
        lastRelieved: data.hosLastRelieved || "",
      },
      otherWork: {
        currentOtherEmployer: data.otherEmployer || "",
        intendOtherEmployer: data.otherEmployerIntent || "",
      },
      authorizations: {
        mvr: !!data.authMVR,
        psp: !!data.authPSP,
        clearinghouse: !!data.authClearinghouse,
        drugAlcohol: !!data.authDA,
        fcra: !!data.authFCRA,
        handbook: !!data.authHandbook,
        dlCert: !!data.authDLCert,
        otherWork: !!data.authOtherWork,
      },
      banking: {
        accountType: data.accountType || "",
        bankName: data.bankName || "",
        // Last 4 only — never store full account numbers.
        // Full routing/account numbers are NOT collected pre-hire. Direct deposit is
        // set up after an offer, through a channel built for it. Holding a rejected
        // applicant's bank details is pure liability with no operational use.
        routingLast4: (data.routingNumber || "").slice(-4),
        accountLast4: (data.accountNumber || "").slice(-4),
      },
      files: fileUrls,
      signatureUrl,
      pdfUrl,
      // Server-computed, not taken from the client. See computeDisqualified().
      review: {
        disqualified: isDisqualified,
        disqualifyingAnswers: isDisqualified
          ? {
              refusedTest: data.daRefused || "",
              positiveTest: data.daPositive || "",
              preEmploymentPositive: data.daPreEmpPositive || "",
            }
          : null,
      },
      // TCPA / A2P 10DLC consent evidence. The defensible record is the exact
      // language shown, the number it was given for, and a SERVER timestamp — a
      // client-supplied timestamp proves nothing.
      smsConsent: {
        granted: !!data.smsConsent,
        phone: data.phone || "",
        consentTextVersion: data.smsConsentVersion || "unversioned",
        // Store the literal language AND its digest. The text is the evidence; the
        // digest makes it cheap to prove the stored copy was not edited afterwards.
        consentText: data.smsConsentText || "",
        consentTextSha256: data.smsConsentText
          ? createHash("sha256").update(data.smsConsentText, "utf8").digest("hex")
          : "",
        clientTimestamp: data.smsConsentTimestamp || "",
        serverTimestamp: Timestamp.now(),
        ip: clientIp(req.headers),
        userAgent: req.headers.get("user-agent") || "",
        pageUrl: req.headers.get("referer") || "",
      },
      // ESIGN §7001(c) / 49 CFR 390.32 evidence. An electronic FMCSR document needs a
      // record that the signer consented to transact electronically — a drawn
      // signature on its own is a DOT-auditable gap, not merely weak in civil court.
      electronicSignature: {
        consentToElectronicRecords: !!signature,
        signedAt: Timestamp.now(),
        ip: clientIp(req.headers),
        userAgent: req.headers.get("user-agent") || "",
        method: "canvas-drawn",
        certificationCitation: "49 CFR 391.21(b)(12)",
      },
      // Audit / compliance
      meta: {
        submittedAt: Timestamp.now(),
        userAgent: req.headers.get("user-agent") || "",
        ip: clientIp(req.headers),
        referer: req.headers.get("referer") || "",
      },
      // Sensitive — AES-256-GCM, key held outside the Firebase project.
      //
      // Firestore's at-rest encryption is transparent to anyone who can read the
      // document, so it does nothing against a security-rules mistake. Field-level
      // encryption with a separated key is what preserves the 815 ILCS 530 safe
      // harbour: PIPA's "personal information" reaches only UNENCRYPTED data.
      //
      // Decrypt server-side via lib/field-crypto.decryptField() when running the
      // MVR or Clearinghouse query. Never expose this through a client-callable route.
      _encrypted: {
        ssn: encryptField(data.ssn),
        algorithm: "aes-256-gcm",
      },
    };

    await db().collection("driverApplications").doc(applicationId).set(docData);

    // Update aggregate counter
    await db().collection("metadata").doc("applications").set(
      {
        totalSubmitted: FieldValue.increment(1),
        lastSubmittedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // ============== SYNC TO SQUARESCHEDULE ==============
    // Non-fatal by design: the applicant has already signed and certified, so a
    // recruiting-system outage must not cost them the submission. A failed push
    // is recorded on the document and retried by /api/resync.
    stage = "sync";
    const syncOutcome = await pushToSquareSchedule(docData, applicationId);
    await recordSyncOutcome(applicationId, syncOutcome);

    // ============== NOTIFY VIA SMS (fallback only) ==============
    // SquareSchedule sends the recruiting alert when it ingests the application
    // — that is where the RingCentral credentials live, and it only fires once
    // the application is actually in the system of record.
    //
    // This portal texts ONLY when the push failed, because in that case
    // SquareSchedule never saw the application and cannot alert anyone. Without
    // this condition, configuring RingCentral here would double-text the team
    // on every submission.
    stage = "sms";
    let smsResult: any = null;
    try {
      if (syncOutcome.ok) {
        smsResult = { skipped: "notified by squareschedule" };
      } else {
      smsResult = await notifyNewApplication({
        applicationId,
        driverName,
        driverPhone: data.phone || "",
        position: data.position || "",
        pdfUrl,
        needsReview: isDisqualified,
        // Tell the recruiter when the application did NOT reach SquareSchedule,
        // so a silent sync failure does not become a lost applicant.
        syncFailed: true,
      });
      }
    } catch (e: any) {
      console.error("[submit] SMS notify failed (non-fatal):", e?.message || "unknown error");
    }

    return NextResponse.json({
      ok: true,
      applicationId,
      pdfUrl,
      synced: syncOutcome.ok,
      sms: smsResult?.results
        ? { sent: smsResult.ok, recipients: smsResult.results.length }
        : smsResult || { skipped: true },
    });
  } catch (e: any) {
    // Message only. The exception object on this path can carry the request body —
    // including the SSN — into the log sink, which is exactly what we are trying to
    // avoid. Same reason the message is not echoed to the caller.
    console.error(`[submit] Failed at stage "${stage}": ${e?.message || "unknown error"}`);
    return NextResponse.json(
      { error: `Submission failed at ${stage}. Please call dispatch at (773) 747-8436.` },
      { status: 500 }
    );
  }
}
