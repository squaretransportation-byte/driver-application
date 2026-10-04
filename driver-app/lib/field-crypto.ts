import crypto from "crypto";

/**
 * Field-level encryption for applicant PII stored in Firestore.
 *
 * WHY THIS EXISTS
 * ---------------
 * 815 ILCS 530 (Illinois Personal Information Protection Act) defines "personal
 * information" as data that is *unencrypted and unredacted*. An unauthorized read
 * of plaintext SSNs is a mandatory breach-notification event; an unauthorized read
 * of ciphertext is not, provided the key is not compromised with the data.
 *
 * The key separation is the load-bearing control. PII_ENCRYPTION_KEY must live in
 * Vercel environment variables or Google Secret Manager — NOT in the Firebase
 * project, NOT in the same service account that reads Firestore. If the key is
 * stored alongside the ciphertext, PIPA treats the data as unencrypted and the
 * safe harbour is gone.
 *
 * Firestore's own at-rest encryption does not help here: it is transparent to
 * anyone who can read the document, so a security-rules misconfiguration exposes
 * plaintext.
 *
 * KEY GENERATION
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Store the output as PII_ENCRYPTION_KEY.
 *
 * ROTATION
 * Ciphertext carries a key version prefix. To rotate, set PII_ENCRYPTION_KEY to the
 * new key and PII_ENCRYPTION_KEY_PREVIOUS to the old one; decrypt tries both.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const CURRENT_VERSION = "v1";

function loadKey(envValue: string | undefined): Buffer | null {
  if (!envValue) return null;
  let key: Buffer;
  try {
    key = Buffer.from(envValue, "base64");
  } catch {
    return null;
  }
  if (key.length !== 32) return null;
  return key;
}

function primaryKey(): Buffer | null {
  return loadKey(process.env.PII_ENCRYPTION_KEY);
}

function previousKey(): Buffer | null {
  return loadKey(process.env.PII_ENCRYPTION_KEY_PREVIOUS);
}

export function encryptionAvailable(): boolean {
  return primaryKey() !== null;
}

/**
 * Encrypt a sensitive string. Returns null for empty input.
 *
 * Throws if no valid key is configured. Callers must decide whether to fail the
 * request or drop the field — this module will never silently return plaintext.
 */
export function encryptField(plaintext: string | undefined | null): string | null {
  if (!plaintext) return null;

  const key = primaryKey();
  if (!key) {
    throw new Error(
      "PII_ENCRYPTION_KEY is not set or is not a 32-byte base64 value. " +
        "Refusing to store sensitive data in plaintext."
    );
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // version:iv:authTag:ciphertext — all base64
  return [
    CURRENT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by encryptField. Returns null if the value cannot be
 * decrypted with either the current or previous key.
 *
 * Intended for server-side use only — recruiter tooling that needs the full SSN
 * to run an MVR or Clearinghouse query. Never expose this through a client-callable
 * route without authenticating and authorising the caller.
 */
export function decryptField(stored: string | undefined | null): string | null {
  if (!stored) return null;

  const parts = stored.split(":");
  if (parts.length !== 4) return null;

  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== CURRENT_VERSION) return null;

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");

  for (const key of [primaryKey(), previousKey()]) {
    if (!key) continue;
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Wrong key or tampered ciphertext — try the next key.
    }
  }

  return null;
}

/**
 * Redact an SSN to the last four digits. Safe for display, search, and logs.
 */
export function redactSSN(ssn: string | undefined | null): string {
  if (!ssn) return "";
  const digits = String(ssn).replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}

/**
 * Strip every sensitive key from an object before it is logged, sent to a third
 * party, or embedded in a prompt. Recurses into nested objects and arrays.
 *
 * Deny-list by key name — deliberately aggressive. If a key name looks sensitive,
 * it is removed. A false positive costs a redacted log line; a false negative
 * sends an SSN to a third-party API.
 */
const SENSITIVE_KEY_PATTERN =
  /(ssn|social.?security|routing|account.?number|accountnum|bank.?account|tax.?id|ein|passport|driver.?licen[cs]e.?number|licensenumber|password|secret|token|api.?key)/i;

export function stripSensitive<T>(input: T): T {
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    return input.map((item) => stripSensitive(item)) as unknown as T;
  }

  if (typeof input === "object") {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = stripSensitive(value);
    }
    return out as unknown as T;
  }

  return input;
}
