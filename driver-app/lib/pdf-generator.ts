import { PDFDocument, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";

const COLORS = {
  maroon: rgb(0.42, 0.10, 0.10),
  navy: rgb(0.06, 0.11, 0.18),
  gold: rgb(0.72, 0.57, 0.29),
  cream: rgb(0.96, 0.94, 0.90),
  ink: rgb(0.04, 0.06, 0.10),
  light: rgb(0.92, 0.92, 0.92),
  text: rgb(0.15, 0.15, 0.15),
  muted: rgb(0.45, 0.45, 0.45),
  red: rgb(0.55, 0.16, 0.16),
};

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 50;

interface Cursor {
  page: PDFPage;
  doc: PDFDocument;
  fonts: { regular: any; bold: any };
  y: number;
  pageNum: number;
}

function newPage(c: Cursor): Cursor {
  const page = c.doc.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, c.fonts, c.pageNum + 1);
  drawFooter(page, c.fonts, c.pageNum + 1);
  return { ...c, page, y: PAGE_H - 110, pageNum: c.pageNum + 1 };
}

function ensureSpace(c: Cursor, needed: number): Cursor {
  if (c.y - needed < 80) {
    return newPage(c);
  }
  return c;
}

function drawHeader(page: PDFPage, fonts: any, pageNum: number) {
  // Top maroon band
  page.drawRectangle({
    x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60,
    color: COLORS.navy,
  });
  // Gold accent line
  page.drawRectangle({
    x: 0, y: PAGE_H - 64, width: PAGE_W, height: 4,
    color: COLORS.gold,
  });
  // Logo block (square)
  page.drawRectangle({
    x: MARGIN, y: PAGE_H - 50, width: 30, height: 30,
    color: COLORS.maroon,
    rotate: { type: "degrees", angle: 45 } as any,
  });
  // Brand text
  page.drawText("SQUARE TRANSPORTATION", {
    x: MARGIN + 32, y: PAGE_H - 32,
    size: 13, font: fonts.bold, color: COLORS.cream,
  });
  page.drawText("Driver Qualification File · MC-728978 · DOT-2089206", {
    x: MARGIN + 32, y: PAGE_H - 47,
    size: 7, font: fonts.regular, color: COLORS.gold,
  });
  // Page indicator
  page.drawText(`PAGE ${pageNum}`, {
    x: PAGE_W - MARGIN - 50, y: PAGE_H - 35,
    size: 8, font: fonts.bold, color: COLORS.gold,
  });
}

function drawFooter(page: PDFPage, fonts: any, pageNum: number) {
  page.drawRectangle({
    x: 0, y: 0, width: PAGE_W, height: 35,
    color: COLORS.navy,
  });
  page.drawRectangle({
    x: 0, y: 35, width: PAGE_W, height: 2,
    color: COLORS.gold,
  });
  page.drawText("GO BIG · GO SQUARE", {
    x: MARGIN, y: 14,
    size: 8, font: fonts.bold, color: COLORS.gold,
  });
  page.drawText("Generated electronically · 49 CFR Parts 382, 383, 391 compliant", {
    x: PAGE_W - MARGIN - 230, y: 14,
    size: 6, font: fonts.regular, color: COLORS.cream,
  });
}

function drawSectionHeader(c: Cursor, title: string, subtitle?: string): Cursor {
  c = ensureSpace(c, 50);
  c.page.drawRectangle({
    x: MARGIN, y: c.y - 18, width: PAGE_W - MARGIN * 2, height: 22,
    color: COLORS.maroon,
  });
  c.page.drawText(title.toUpperCase(), {
    x: MARGIN + 10, y: c.y - 12,
    size: 11, font: c.fonts.bold, color: COLORS.cream,
  });
  if (subtitle) {
    c.page.drawText(subtitle, {
      x: MARGIN + 10, y: c.y - 26,
      size: 7, font: c.fonts.regular, color: COLORS.muted,
    });
    c.y -= 36;
  } else {
    c.y -= 28;
  }
  return c;
}

function drawField(c: Cursor, label: string, value: string, opts?: { full?: boolean }): Cursor {
  c = ensureSpace(c, 28);
  const w = opts?.full ? PAGE_W - MARGIN * 2 : (PAGE_W - MARGIN * 2 - 8) / 2;
  // label
  c.page.drawText(label.toUpperCase(), {
    x: MARGIN, y: c.y,
    size: 7, font: c.fonts.bold, color: COLORS.gold,
  });
  // value box
  c.page.drawRectangle({
    x: MARGIN, y: c.y - 16, width: w, height: 14,
    borderColor: COLORS.light, borderWidth: 0.5,
    color: rgb(0.99, 0.99, 0.99),
  });
  c.page.drawText(value || "—", {
    x: MARGIN + 4, y: c.y - 12,
    size: 9, font: c.fonts.regular, color: value ? COLORS.text : COLORS.muted,
  });
  c.y -= 24;
  return c;
}

function drawRow(c: Cursor, fields: { label: string; value: string }[]): Cursor {
  c = ensureSpace(c, 28);
  const totalW = PAGE_W - MARGIN * 2;
  const colW = (totalW - 8 * (fields.length - 1)) / fields.length;
  fields.forEach((f, i) => {
    const x = MARGIN + i * (colW + 8);
    c.page.drawText(f.label.toUpperCase(), {
      x, y: c.y,
      size: 7, font: c.fonts.bold, color: COLORS.gold,
    });
    c.page.drawRectangle({
      x, y: c.y - 16, width: colW, height: 14,
      borderColor: COLORS.light, borderWidth: 0.5,
      color: rgb(0.99, 0.99, 0.99),
    });
    c.page.drawText(f.value || "—", {
      x: x + 4, y: c.y - 12,
      size: 9, font: c.fonts.regular, color: f.value ? COLORS.text : COLORS.muted,
    });
  });
  c.y -= 24;
  return c;
}

function drawText(c: Cursor, text: string, opts?: { size?: number; bold?: boolean; color?: RGB }): Cursor {
  c = ensureSpace(c, 14);
  c.page.drawText(text, {
    x: MARGIN, y: c.y,
    size: opts?.size || 8,
    font: opts?.bold ? c.fonts.bold : c.fonts.regular,
    color: opts?.color || COLORS.text,
  });
  c.y -= 12;
  return c;
}

function drawDivider(c: Cursor): Cursor {
  c = ensureSpace(c, 12);
  c.page.drawLine({
    start: { x: MARGIN, y: c.y },
    end: { x: PAGE_W - MARGIN, y: c.y },
    thickness: 0.5, color: COLORS.light,
  });
  c.y -= 8;
  return c;
}

function drawWrappedText(c: Cursor, text: string, maxWidth: number, size = 9): Cursor {
  if (!text) return drawText(c, "—", { size, color: COLORS.muted });
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    const width = c.fonts.regular.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      c = ensureSpace(c, size + 4);
      c.page.drawText(line, { x: MARGIN, y: c.y, size, font: c.fonts.regular, color: COLORS.text });
      c.y -= size + 4;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) {
    c = ensureSpace(c, size + 4);
    c.page.drawText(line, { x: MARGIN, y: c.y, size, font: c.fonts.regular, color: COLORS.text });
    c.y -= size + 4;
  }
  return c;
}

function fmt(v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export async function generateDqfPdf(data: any, applicationId: string, signature?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  let page = doc.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, fonts, 1);
  drawFooter(page, fonts, 1);

  let c: Cursor = { doc, page, fonts, y: PAGE_H - 110, pageNum: 1 };

  // Cover info
  c = drawText(c, `Application ID: ${applicationId}`, { size: 8, color: COLORS.muted });
  c = drawText(c, `Submitted: ${new Date().toISOString()}`, { size: 8, color: COLORS.muted });
  c.y -= 6;

  // ============== PERSONAL ==============
  c = drawSectionHeader(c, "1. Personal Information", "49 CFR §391.21(b)(2)");
  c = drawRow(c, [
    { label: "First Name", value: fmt(data.firstName) },
    { label: "Middle Name", value: fmt(data.middleName) },
    { label: "Last Name", value: fmt(data.lastName) },
  ]);
  c = drawRow(c, [
    { label: "Date of Birth", value: fmt(data.dob) },
    { label: "SSN", value: fmt(data.ssn) },
    { label: "Phone", value: fmt(data.phone) },
  ]);
  c = drawRow(c, [
    { label: "Email", value: fmt(data.email) },
    { label: "Position Applied For", value: fmt(data.position) },
  ]);
  c = drawRow(c, [
    { label: "Date Available", value: fmt(data.dateAvailable) },
    { label: "Legal Right to Work in US", value: fmt(data.legalRight) },
  ]);

  // Residency
  c.y -= 8;
  c = drawText(c, "RESIDENCY (3-YEAR HISTORY)", { size: 8, bold: true, color: COLORS.gold });
  (data.residences || []).forEach((r: any, i: number) => {
    if (!r.street) return;
    c = drawRow(c, [
      { label: i === 0 ? "Current St" : `Prev ${i} St`, value: fmt(r.street) },
      { label: "City", value: fmt(r.city) },
      { label: "State", value: fmt(r.state) },
      { label: "ZIP", value: fmt(r.zip) },
      { label: "Yrs", value: fmt(r.years) },
    ]);
  });

  // ============== LICENSE ==============
  c.y -= 8;
  c = drawSectionHeader(c, "2. License & Driving Experience", "49 CFR §391.21(b)(7) · §383.21");
  c = drawRow(c, [
    { label: "State", value: fmt(data.licenseState) },
    { label: "License Number", value: fmt(data.licenseNumber) },
    { label: "Class", value: fmt(data.licenseClass) },
    { label: "Endorsements", value: fmt(data.licenseEndorsements) },
    { label: "Expiration", value: fmt(data.licenseExpiration) },
  ]);
  c = drawRow(c, [
    { label: "DOT Medical Card Expiration", value: fmt(data.medCardExpiration) },
  ]);

  // Driving experience
  if ((data.experience || []).some((e: any) => e.equipment)) {
    c.y -= 6;
    c = drawText(c, "DRIVING EXPERIENCE", { size: 8, bold: true, color: COLORS.gold });
    (data.experience || []).forEach((ex: any) => {
      if (!ex.equipment) return;
      c = drawRow(c, [
        { label: "Equipment", value: fmt(ex.equipment) },
        { label: "From", value: fmt(ex.from) },
        { label: "To", value: fmt(ex.to) },
        { label: "Total Miles", value: fmt(ex.miles) },
      ]);
    });
  }

  // ============== RECORD ==============
  c.y -= 8;
  c = drawSectionHeader(c, "3. Accident & Conviction Record", "Past 3 Years · §391.21(b)(8)–(9)");
  c = drawRow(c, [
    { label: "Accidents Past 3 Yrs", value: data.noAccidents ? "None" : `${(data.accidents || []).filter((a: any) => a.date).length} reported` },
    { label: "Convictions Past 3 Yrs", value: data.noConvictions ? "None" : `${(data.convictions || []).filter((c: any) => c.date).length} reported` },
  ]);
  c.y -= 4;
  c = drawText(c, "COMPLIANCE QUESTIONS", { size: 8, bold: true, color: COLORS.gold });
  const compQs = [
    ["License/permit ever denied?", data.everDeniedLicense],
    ["License ever suspended/revoked?", data.everSuspended],
    ["Convicted re: CMV?", data.everConvictedCMV],
    ["Convicted of any law violation (excl. minor traffic)?", data.everConvictedLaw],
  ];
  compQs.forEach(([q, a]) => {
    c = ensureSpace(c, 14);
    c.page.drawText(`• ${q}`, { x: MARGIN + 5, y: c.y, size: 8, font: regular, color: COLORS.text });
    const isYes = a === "Yes";
    c.page.drawText(fmt(a), {
      x: PAGE_W - MARGIN - 60, y: c.y,
      size: 9, font: bold,
      color: isYes ? COLORS.red : COLORS.text,
    });
    c.y -= 12;
  });
  if (data.complianceExplain) {
    c.y -= 4;
    c = drawText(c, "EXPLANATION:", { size: 7, bold: true, color: COLORS.gold });
    c = drawWrappedText(c, data.complianceExplain, PAGE_W - MARGIN * 2, 8);
  }

  // ============== EMPLOYMENT ==============
  c.y -= 8;
  c = drawSectionHeader(c, "4. Employment History", "10 Years Required · §391.21(b)(10)–(11)");
  (data.employers || []).forEach((emp: any, i: number) => {
    if (!emp.name) return;
    c = ensureSpace(c, 60);
    c = drawText(c, `${i === 0 ? "CURRENT / MOST RECENT" : `PREVIOUS EMPLOYER ${i}`}`, { size: 8, bold: true, color: COLORS.gold });
    c = drawRow(c, [
      { label: "Business", value: fmt(emp.name) },
      { label: "Phone", value: fmt(emp.phone) },
      { label: "May Contact", value: fmt(emp.contactOk) },
    ]);
    c = drawRow(c, [
      { label: "Position", value: fmt(emp.position) },
      { label: "Start", value: fmt(emp.startDate) },
      { label: "End", value: fmt(emp.endDate) },
    ]);
    c = drawRow(c, [
      { label: "DOT D&A Tested", value: fmt(emp.dotTested) },
      { label: "FMCSA Subject", value: fmt(emp.fmcsaSubject) },
    ]);
    if (emp.reasonLeaving) {
      c = drawText(c, "REASON FOR LEAVING:", { size: 7, bold: true, color: COLORS.gold });
      c = drawWrappedText(c, emp.reasonLeaving, PAGE_W - MARGIN * 2, 8);
    }
    c = drawDivider(c);
  });

  // ============== D&A ==============
  c.y -= 4;
  c = drawSectionHeader(c, "5. Drug & Alcohol Disclosure", "49 CFR Part 382");
  const daQs = [
    ["Ever refused D&A test?", data.daRefused],
    ["Ever tested positive?", data.daPositive],
    ["Ever pre-employment positive?", data.daPreEmpPositive],
  ];
  daQs.forEach(([q, a]) => {
    c = ensureSpace(c, 14);
    c.page.drawText(`• ${q}`, { x: MARGIN + 5, y: c.y, size: 8, font: regular, color: COLORS.text });
    c.page.drawText(fmt(a), {
      x: PAGE_W - MARGIN - 60, y: c.y,
      size: 9, font: bold,
      color: a === "Yes" ? COLORS.red : COLORS.text,
    });
    c.y -= 12;
  });
  if (data.daExplain) {
    c.y -= 4;
    c = drawText(c, "RETURN-TO-DUTY STATEMENT:", { size: 7, bold: true, color: COLORS.gold });
    c = drawWrappedText(c, data.daExplain, PAGE_W - MARGIN * 2, 8);
  }

  // HOS
  c.y -= 8;
  c = drawSectionHeader(c, "6. Hours of Service Statement", "§395.8(j)(2)");
  c = drawRow(c, [
    { label: "Total On-Duty Past 7 Days", value: fmt(data.hosTotal) },
    { label: "Last Relieved", value: fmt(data.hosLastRelieved) },
  ]);

  // Other comp
  c = drawRow(c, [
    { label: "Currently Other Employer?", value: fmt(data.otherEmployer) },
    { label: "Intend to Work Elsewhere?", value: fmt(data.otherEmployerIntent) },
  ]);

  // ============== AUTHORIZATIONS ==============
  c.y -= 8;
  c = drawSectionHeader(c, "7. Authorizations & Consents", "All Required Per FMCSA");
  const auths = [
    ["MVR Release", data.authMVR],
    ["PSP Release", data.authPSP],
    ["FMCSA Clearinghouse Query Consent", data.authClearinghouse],
    ["Drug & Alcohol Testing Consent", data.authDA],
    ["Fair Credit Reporting Act Disclosure", data.authFCRA],
    ["Employee Handbook Acknowledgment", data.authHandbook],
    ["Driver License Certification (one license)", data.authDLCert],
    ["Other Compensated Work Notification", data.authOtherWork],
  ];
  auths.forEach(([label, agreed]) => {
    c = ensureSpace(c, 14);
    c.page.drawRectangle({
      x: MARGIN, y: c.y - 1, width: 8, height: 8,
      borderColor: COLORS.gold, borderWidth: 0.8,
      color: agreed ? COLORS.gold : rgb(1, 1, 1),
    });
    if (agreed) {
      c.page.drawText("✓", {
        x: MARGIN + 1, y: c.y, size: 9, font: bold, color: COLORS.navy,
      });
    }
    c.page.drawText(label as string, {
      x: MARGIN + 14, y: c.y,
      size: 8, font: regular, color: COLORS.text,
    });
    c.page.drawText(agreed ? "AGREED" : "NOT AGREED", {
      x: PAGE_W - MARGIN - 60, y: c.y,
      size: 7, font: bold,
      color: agreed ? COLORS.gold : COLORS.red,
    });
    c.y -= 12;
  });

  // ============== SIGNATURE ==============
  c.y -= 12;
  c = drawSectionHeader(c, "8. Driver Certification & Signature");
  c = drawWrappedText(c,
    "I certify that I completed this application and that all entries on it and information in it are true and complete to the best of my knowledge. I authorize the company to make investigations into my personal, employment, financial, medical history, and other related matters as may be necessary in arriving at an employment decision.",
    PAGE_W - MARGIN * 2, 8);
  c.y -= 8;

  // Signature image
  if (signature && signature.startsWith("data:image/")) {
    try {
      const sigBytes = Buffer.from(signature.split(",")[1], "base64");
      const sigImage = await doc.embedPng(sigBytes);
      const sigDims = sigImage.scale(0.4);
      c = ensureSpace(c, sigDims.height + 30);
      c.page.drawImage(sigImage, {
        x: MARGIN, y: c.y - sigDims.height,
        width: Math.min(sigDims.width, 200),
        height: Math.min(sigDims.height, 60),
      });
      c.page.drawLine({
        start: { x: MARGIN, y: c.y - 65 },
        end: { x: MARGIN + 220, y: c.y - 65 },
        thickness: 0.5, color: COLORS.text,
      });
      c.page.drawText("APPLICANT SIGNATURE", {
        x: MARGIN, y: c.y - 76,
        size: 7, font: bold, color: COLORS.gold,
      });
      c.page.drawText(`${data.firstName || ""} ${data.lastName || ""}`.toUpperCase().trim(), {
        x: MARGIN + 240, y: c.y - 60,
        size: 9, font: bold, color: COLORS.text,
      });
      c.page.drawText("PRINTED NAME · " + new Date().toLocaleDateString("en-US"), {
        x: MARGIN + 240, y: c.y - 76,
        size: 7, font: bold, color: COLORS.gold,
      });
    } catch (e) {
      c = drawText(c, "[Signature embed failed]", { color: COLORS.red, size: 8 });
    }
  } else {
    c = drawText(c, "[No signature provided]", { color: COLORS.red, size: 8 });
  }

  return await doc.save();
}
