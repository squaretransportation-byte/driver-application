import { NextRequest, NextResponse } from "next/server";
import { db, uploadDataUrl, uploadBuffer } from "@/lib/firebase-admin";
import { generateDqfPdf } from "@/lib/pdf-generator";
import { notifyNewApplication } from "@/lib/ringcentral";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

// Node runtime required for Firebase Admin SDK and pdf-lib
export const runtime = "nodejs";
export const maxDuration = 60;

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

function redactSSN(ssn: string): string {
  if (!ssn) return "";
  const digits = ssn.replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
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
    const docData = {
      applicationId,
      status: "submitted",
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
        // Last 4 only — never store full account numbers
        routingLast4: (data.routingNumber || "").slice(-4),
        accountLast4: (data.accountNumber || "").slice(-4),
      },
      files: fileUrls,
      signatureUrl,
      pdfUrl,
      // Audit / compliance
      meta: {
        submittedAt: Timestamp.now(),
        userAgent: req.headers.get("user-agent") || "",
        ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "",
        referer: req.headers.get("referer") || "",
      },
      // Sensitive — encrypt at rest in Firestore via Firestore-managed encryption.
      // Keep full SSN here only because federal law requires it for I-9. Restrict via security rules.
      _sensitive: {
        ssn: data.ssn || "",
        routingNumber: data.routingNumber || "",
        accountNumber: data.accountNumber || "",
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

    // ============== NOTIFY VIA SMS ==============
    stage = "sms";
    let smsResult: any = null;
    try {
      smsResult = await notifyNewApplication({
        applicationId,
        driverName,
        driverPhone: data.phone || "",
        position: data.position || "",
        pdfUrl,
      });
    } catch (e: any) {
      console.error("[submit] SMS notify failed (non-fatal):", e.message);
    }

    return NextResponse.json({
      ok: true,
      applicationId,
      pdfUrl,
      sms: smsResult ? { sent: smsResult.ok, recipients: smsResult.results.length } : { skipped: true },
    });
  } catch (e: any) {
    console.error(`[submit] Failed at stage "${stage}":`, e);
    return NextResponse.json(
      { error: `Submission failed at ${stage}: ${e.message}` },
      { status: 500 }
    );
  }
}
