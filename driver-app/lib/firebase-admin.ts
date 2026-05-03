import { cert, getApps, initializeApp, App, getApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let _app: App | null = null;

function getFirebaseApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApp();
    return _app;
  }

  const saB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!saB64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 env var not set");
  }
  if (!bucket) {
    throw new Error("FIREBASE_STORAGE_BUCKET env var not set");
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(Buffer.from(saB64, "base64").toString("utf-8"));
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64-encoded JSON");
  }

  _app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: bucket,
  });
  return _app;
}

export function db(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function bucket() {
  return getStorage(getFirebaseApp()).bucket();
}

/**
 * Upload a base64 data URL to Firebase Storage.
 * Returns the public download URL.
 */
export async function uploadDataUrl(
  dataUrl: string,
  destPath: string
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  const file = bucket().file(destPath);
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: "private, max-age=3600" },
  });

  // Generate a long-lived signed URL (7 days). Internal use — recruiters access via dashboard.
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

/**
 * Upload raw buffer (e.g. generated PDF) to Storage.
 */
export async function uploadBuffer(
  buffer: Buffer,
  destPath: string,
  contentType: string
): Promise<string> {
  const file = bucket().file(destPath);
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: "private, max-age=3600" },
  });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}
