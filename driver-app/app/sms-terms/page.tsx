// SMS Terms & Conditions — required for A2P 10DLC compliance.
// Public, no auth, indexable. Carriers (Verizon/AT&T/T-Mobile) review this URL
// during 10DLC brand/campaign registration. This page MUST contain all 8 sections
// below in plain language with no walls of legalese.

import type { ReactNode } from "react";

export const metadata = {
  title: "SMS Terms & Conditions | Square Transportation Solution Inc",
  description:
    "SMS Terms & Conditions for driver applicants and employees of Square Transportation Solution Inc.",
};

const BRAND = {
  navy: "#0F1B2D",
  navyLight: "#1A2A3E",
  ink: "#0A1220",
  maroon: "#6B1A1A",
  gold: "#B8924A",
  cream: "#F4E8D0",
};

export default function SMSTermsPage() {
  return (
    <main
      className="min-h-screen w-full"
      style={{ background: BRAND.ink, color: BRAND.cream }}
    >
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-16">
        {/* Header */}
        <header className="border-b pb-6 mb-8" style={{ borderColor: BRAND.gold + "30" }}>
          <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: BRAND.gold }}>
            Square Transportation Solution Inc
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: BRAND.cream }}>
            SMS Terms & Conditions
          </h1>
          <p className="text-sm" style={{ color: "#8896A8" }}>
            Effective: May 2026 · Last updated: May 2026
          </p>
        </header>

        {/* Intro */}
        <section className="mb-8 text-[15px] leading-relaxed" style={{ color: "#C8D2E0" }}>
          <p>
            These SMS Terms & Conditions ("Terms") describe how Square Transportation
            Solution Inc ("we," "us," or "our") communicates with driver applicants,
            employees, and contractors by text message (SMS). By providing your mobile
            phone number and consenting to receive SMS messages from us, you agree
            to these Terms.
          </p>
        </section>

        {/* 1. SMS Consent */}
        <Section number="1" title="SMS Consent Communication">
          <p>
            The information (including phone numbers) obtained as part of the SMS
            consent process will <strong>not</strong> be shared with third parties
            for marketing purposes. Phone numbers and related information are used
            solely to facilitate direct communication with you regarding your driver
            application, hiring process, onboarding, and (post-hire) ongoing dispatch
            and account matters.
          </p>
        </Section>

        {/* 2. Types of SMS Communications */}
        <Section number="2" title="Types of SMS Communications">
          <p>
            If you have consented to receive text messages from Square Transportation
            Solution Inc, you may receive messages related to the following:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1.5">
            <li>Driver application status updates and confirmations</li>
            <li>Document verification reminders (CDL, medical card, MVR, drug screen, etc.)</li>
            <li>Interview, orientation, and road-test scheduling</li>
            <li>Onboarding paperwork follow-ups and missing-item requests</li>
            <li>Pre-employment screening updates (drug screen results, background check status)</li>
            <li>Load assignments, dispatch updates, and detention notifications (post-hire only)</li>
            <li>Equipment, fuel card, and payroll-related inquiries (post-hire only)</li>
          </ul>
          <div
            className="mt-4 p-4 rounded text-sm italic"
            style={{ background: BRAND.navyLight, borderLeft: `3px solid ${BRAND.gold}` }}
          >
            <strong className="not-italic" style={{ color: BRAND.gold }}>Example: </strong>
            "Hi John, this is Square Transportation. We received your driver application
            and need a copy of your current medical card to continue. Reply with a photo
            or visit apply.gosquare.net to upload. Reply STOP to opt out of SMS from
            Square Transportation at any time."
          </div>
        </Section>

        {/* 3. Message Frequency */}
        <Section number="3" title="Message Frequency">
          <p>
            Message frequency may vary depending on the stage of your application or
            employment. You may receive up to <strong>5 SMS messages per week</strong>{" "}
            during the active application and onboarding stages, and occasional
            messages thereafter related to dispatch, payroll, or account matters.
          </p>
        </Section>

        {/* 4. Potential Fees */}
        <Section number="4" title="Potential Fees for SMS Messaging">
          <p>
            Standard message and data rates may apply, depending on your wireless
            carrier's pricing plan. These fees may vary if messages are sent
            domestically or internationally. Square Transportation Solution Inc does
            not charge a fee to receive our SMS messages, but your carrier may.
          </p>
        </Section>

        {/* 5. Opt-In Method */}
        <Section number="5" title="Opt-In Method">
          <p>
            You may opt in to receive SMS messages from Square Transportation Solution
            Inc in the following ways:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1.5">
            <li>
              Submitting an online driver application at{" "}
              <strong>apply.gosquare.net</strong> and selecting the SMS consent
              checkbox during the phone-number step.
            </li>
            <li>
              Verbally consenting during a recruiter phone call, voice interview,
              or in-person conversation with a Square Transportation representative.
            </li>
            <li>
              Filling out a paper driver application form and checking the SMS
              consent box.
            </li>
          </ul>
        </Section>

        {/* 6. Opt-Out Method */}
        <Section number="6" title="Opt-Out Method">
          <p>
            You can opt out of receiving SMS messages from us at any time. To do so:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1.5">
            <li>
              Reply <strong>STOP</strong> to any SMS message you receive from us.
              You will receive a confirmation message and no further texts will be
              sent (other than the confirmation).
            </li>
            <li>
              Contact us directly to request removal from our messaging list at
              the contact information listed below.
            </li>
          </ul>
        </Section>

        {/* 7. Help */}
        <Section number="7" title="Help">
          <p>
            If you are experiencing any issues, reply with the keyword{" "}
            <strong>HELP</strong> to any of our SMS messages. You may also contact
            us directly using the information listed at the bottom of this page.
          </p>
          <p className="mt-3">
            <strong>Additional Option:</strong> If you do not wish to receive SMS
            messages from Square Transportation Solution Inc, simply do not check
            the SMS consent box on our application forms.
          </p>
        </Section>

        {/* 8. Standard Disclosures */}
        <Section number="8" title="Standard Messaging Disclosures">
          <p>
            Message and data rates may apply. You can opt out at any time by texting{" "}
            <strong>STOP</strong>. For assistance, text <strong>HELP</strong> or
            contact us using the information below. Message frequency may vary.
            Carriers are not liable for delayed or undelivered messages. See our
            Privacy Policy and Terms and Conditions for additional information.
          </p>
        </Section>

        {/* Company Info Footer */}
        <section
          className="mt-12 pt-6 border-t"
          style={{ borderColor: BRAND.gold + "30", color: "#8896A8" }}
        >
          <h2
            className="text-[11px] uppercase tracking-[0.3em] mb-4"
            style={{ color: BRAND.gold }}
          >
            Contact Information
          </h2>
          <div className="text-sm leading-relaxed space-y-1" style={{ color: "#C8D2E0" }}>
            <div className="font-bold" style={{ color: BRAND.cream }}>
              Square Transportation Solution Inc
            </div>
            <div>MC: 728978 · DOT: 2089206</div>
            <div>2744 Fairhauser Rd, Naperville, IL 60564</div>
            <div>
              Email:{" "}
              <a
                href="mailto:hr@gosquare.net"
                className="underline"
                style={{ color: BRAND.gold }}
              >
                hr@gosquare.net
              </a>
            </div>
            <div>
              Web:{" "}
              <a
                href="https://gosquare.net"
                className="underline"
                style={{ color: BRAND.gold }}
              >
                gosquare.net
              </a>
            </div>
          </div>
        </section>

        {/* Bottom nav */}
        <nav
          className="mt-10 pt-6 border-t text-sm flex flex-wrap gap-4"
          style={{ borderColor: BRAND.gold + "20" }}
        >
          <a href="/" className="underline" style={{ color: BRAND.gold }}>
            ← Back to driver application
          </a>
          <span style={{ color: "#5A6878" }}>·</span>
          <a
            href="https://gosquare.net"
            className="underline"
            style={{ color: BRAND.gold }}
          >
            gosquare.net
          </a>
        </nav>
      </div>
    </main>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2
        className="text-lg font-bold mb-3 flex items-baseline gap-3"
        style={{ color: BRAND.cream }}
      >
        <span
          className="text-[11px] uppercase tracking-[0.3em] font-bold"
          style={{ color: BRAND.gold }}
        >
          {number}
        </span>
        <span>{title}</span>
      </h2>
      <div
        className="text-[15px] leading-relaxed pl-0"
        style={{ color: "#C8D2E0" }}
      >
        {children}
      </div>
    </section>
  );
}
