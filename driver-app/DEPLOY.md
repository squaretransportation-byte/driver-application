# Square Transportation Driver Application — Deploy Guide

Production stack: Next.js 15 + Firebase + Anthropic + RingCentral

## Architecture

```
Browser
  ├─ Voice (Web Speech API)
  ├─ Form persistence (localStorage)
  └─ Submit → /api/submit
                ├─ Compress images client-side
                ├─ Upload files → Firebase Storage
                ├─ Generate DQF PDF (pdf-lib) → Storage
                ├─ Write to Firestore
                └─ Send SMS via RingCentral
              → /api/chat (Edge runtime)
                └─ Proxy to Anthropic API
```

## Deploy steps (in order)

### 1. Firebase setup (one-time)

If you don't have a separate Firebase project for this, create one:
1. Go to https://console.firebase.google.com → Add project
2. Name: `sts-driver-applications`
3. Enable Firestore (Native mode, choose us-central1)
4. Enable Storage (default bucket)
5. Project Settings → Service accounts → **Generate new private key**
6. Download the JSON file (this is your service account credentials)

Apply the security rules:
```bash
# Install Firebase CLI if you don't have it
npm install -g firebase-tools
firebase login
firebase init firestore storage   # link to your project
firebase deploy --only firestore:rules,storage
```

(You can also paste the contents of `firestore.rules` and `storage.rules` into the Firebase Console UI.)

### 2. Encode service account for Vercel

Vercel env vars don't accept multi-line JSON well. Base64-encode it:

```bash
# macOS / Linux
cat your-service-account.json | base64 | tr -d '\n' > sa.b64
cat sa.b64
```

Copy the output — that's your `FIREBASE_SERVICE_ACCOUNT_B64` value.

### 3. RingCentral JWT setup (one-time, optional)

If you want SMS notifications:
1. Sign in to https://service.ringcentral.com/ → Admin Portal
2. Apps & Resources → JWT credentials → Create JWT
3. Pick your app, give it SMS scope, copy the JWT (long string starting with `eyJ`)
4. Get your app's Client ID + Client Secret from the developer portal

### 4. Vercel environment variables

Go to https://vercel.com/volodymyr-sovtysiks-projects/driver-application/settings/environment-variables

Add all of these. Apply to **Production, Preview, and Development**:

| Variable | Required | Example | Where to get it |
|----------|----------|---------|-----------------|
| `ANTHROPIC_API_KEY` | ✅ | `sk-ant-api03-...` | console.anthropic.com/settings/keys |
| `FIREBASE_SERVICE_ACCOUNT_B64` | ✅ | `eyJ0eXBlIjoic2VydmljZV9hY2NvdW50...` | Step 2 above |
| `FIREBASE_STORAGE_BUCKET` | ✅ | `sts-driver-applications.firebasestorage.app` | Firebase Console → Storage tab |
| `RINGCENTRAL_CLIENT_ID` | ⚪ | `abc123...` | RingCentral developer portal |
| `RINGCENTRAL_CLIENT_SECRET` | ⚪ | `xyz789...` | RingCentral developer portal |
| `RINGCENTRAL_JWT_TOKEN` | ⚪ | `eyJraWQiOi...` (very long) | RingCentral admin portal |
| `RINGCENTRAL_FROM_NUMBER` | ⚪ | `+17737478436` | Your RingCentral DID, E.164 format |
| `RINGCENTRAL_DISPATCH_NUMBERS` | ⚪ | `+17732221234,+17733334567` | Comma-separated recruiter numbers |
| `RINGCENTRAL_SERVER` | ⚪ | `https://platform.ringcentral.com` | Default — only set if sandbox |

**Without the RingCentral vars**, SMS will be skipped (logged warning, not an error). Submission still works fully.

### 5. Disable Vercel deployment protection

You'll hit the same wall as the Ava Management System. Public users can't fill out forms behind SSO.

Go to: https://vercel.com/volodymyr-sovtysiks-projects/driver-application/settings/deployment-protection

Set **Vercel Authentication** to **Disabled**. Save.

### 6. Push the code

The project is GitHub-connected to `squaretransportation-byte/driver-application`. Pushing to `main` auto-deploys.

```bash
cd driver-app
git init
git remote add origin https://github.com/squaretransportation-byte/driver-application.git
git fetch origin
git checkout -b main
git add -A
git commit -m "feat: voice interview onboarding with Firestore + PDF + RingCentral SMS"
git push origin main --force
```

(`--force` because the existing `main` has the boilerplate template you need to replace.)

Vercel detects the push and rebuilds in ~60 seconds.

### 7. Verify deployment

Once Vercel reports the deploy is `READY`:

```bash
# Health check — confirms env vars
curl https://driver-application-five.vercel.app/api/health
```

Expected output (all green):
```json
{
  "ok": true,
  "checks": {
    "anthropic": true,
    "firebase_service_account": true,
    "firebase_storage_bucket": true,
    "ringcentral_client_id": true,
    "ringcentral_client_secret": true,
    "ringcentral_jwt": true,
    "ringcentral_from": true,
    "ringcentral_dispatch_numbers": true
  },
  "missingRequired": [],
  "note": "All critical env vars set"
}
```

If `ok: false`, the listed `missingRequired` keys need to be added to Vercel env vars.

### 8. End-to-end test

1. Open https://driver-application-five.vercel.app/
2. Click **Start Interview** on welcome screen
3. Answer the first 5–10 questions
4. Skip ahead to docs (or click **Manual** if interview is too slow)
5. Upload any test image as CDL Front
6. Sign with mouse
7. Check all 8 authorizations
8. Click **Submit Application**

Expected result on submit:
- Spinner for ~2–5s
- Success screen with **App ID** like `STS-20260503-DRIVER-A1B2C3`
- **Download Signed DQF (PDF)** button — click it to verify the PDF generated
- Recruiter receives SMS within 10 seconds
- New document in Firestore at `driverApplications/{applicationId}`
- Files in Storage at `applications/{applicationId}/uploads/*`

## Firestore schema reference

```
driverApplications/{applicationId}
├─ applicationId: string         e.g. "STS-20260503-SMITH-A1B2C3"
├─ status: "submitted"           workflow state
├─ driver: { firstName, lastName, dob, ssnLast4, email, phone, position, ... }
├─ license: { state, number, class, endorsements, expiration }
├─ medicalCard: { expiration }
├─ residences: [...]
├─ experience: [...]
├─ record: { noAccidents, accidents, noConvictions, convictions, ever* }
├─ employers: [...]
├─ drugAlcohol: { refused, positive, preEmpPositive, explanation }
├─ hoursOfService: { totalPast7Days, lastRelieved }
├─ otherWork: { currentOtherEmployer, intendOtherEmployer }
├─ authorizations: { mvr, psp, clearinghouse, drugAlcohol, fcra, ... }
├─ banking: { accountType, bankName, routingLast4, accountLast4 }
├─ files: { cdlFront: { url, name, size }, cdlBack: ..., medCard: ..., ssn: ..., check: ..., w9: ... }
├─ signatureUrl: string
├─ pdfUrl: string                signed URL to generated DQF
├─ meta: { submittedAt, userAgent, ip, referer }
└─ _sensitive: { ssn, routingNumber, accountNumber }   ← restrict via security rules

metadata/applications
├─ totalSubmitted: number
└─ lastSubmittedAt: Timestamp
```

## Local development

```bash
cd driver-app
npm install
cat > .env.local <<EOF
ANTHROPIC_API_KEY=sk-ant-...
FIREBASE_SERVICE_ACCOUNT_B64=eyJ0e...
FIREBASE_STORAGE_BUCKET=sts-driver-applications.firebasestorage.app
RINGCENTRAL_CLIENT_ID=...
RINGCENTRAL_CLIENT_SECRET=...
RINGCENTRAL_JWT_TOKEN=eyJraWQ...
RINGCENTRAL_FROM_NUMBER=+17737478436
RINGCENTRAL_DISPATCH_NUMBERS=+17735551234
EOF
npm run dev
# http://localhost:3000
```

## Troubleshooting

- **"Submission failed at firestore"** → service account doesn't have Firestore permissions. In Firebase Console → IAM, ensure service account has `Cloud Datastore User` role.
- **"Submission failed at upload-files"** → Storage rules too strict OR service account lacks `Storage Object Admin`. Apply provided `storage.rules`.
- **"FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64"** → re-encode without line breaks (`tr -d '\n'`).
- **PDF download link returns 403 after a week** → signed URLs expire after 7 days. Generate a fresh one server-side, or migrate to public-read for `pdfs/` subdirectory.
- **SMS not sending** → check `/api/health`. If `ringcentral_jwt: true` but no SMS, JWT may be expired (RingCentral JWTs default to 90-day lifetime). Regenerate.
- **Body size error on large file uploads** → uploads are auto-compressed client-side (resize to 1600px, JPEG 80%). If still hitting limits, reduce photos or split file upload to a separate endpoint with signed URLs.

## Future enhancements (not built yet)

- `/admin` dashboard listing all applications, filterable by status
- Status workflow: submitted → reviewing → approved/rejected with audit trail
- Direct integration with SquareSchedule `drivers` collection on approval
- Email confirmation to driver with PDF attachment
- Google Drive backup of all PDFs

---
Square Transportation Solution Inc · MC-728978 · DOT-2089206 · Naperville, IL
