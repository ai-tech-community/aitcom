import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  REGISTRATION_PROVIDERS,
  type RegistrationProvider,
} from "@/lib/events/registration-source";

export const ATTRIBUTION_SECONDS = 7 * 24 * 60 * 60;
interface SourceToken {
  purpose: "link" | "cookie";
  eventId: number;
  source: RegistrationProvider;
  capturedAt: number;
}
const key = (secret: string) => {
  if (!secret) throw new Error("Missing attribution encryption secret");
  return createHash("sha256")
    .update(`ait-event-attribution-v1:${secret}`)
    .digest();
};

export function createSourceToken(
  eventId: number,
  source: RegistrationProvider,
  purpose: SourceToken["purpose"],
  secret: string,
  now = Date.now(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({ purpose, eventId, source, capturedAt: now }),
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

export function readSourceToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SourceToken | null {
  if (!token || token.length > 1024 || !/^[\w-]+$/.test(token)) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      raw.subarray(0, 12),
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    const value = JSON.parse(
      Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as SourceToken;
    if (
      !Number.isSafeInteger(value.eventId) ||
      value.eventId < 1 ||
      !REGISTRATION_PROVIDERS.includes(value.source) ||
      !["link", "cookie"].includes(value.purpose) ||
      !Number.isFinite(value.capturedAt) ||
      value.capturedAt > now ||
      (value.purpose === "cookie" &&
        now - value.capturedAt >= ATTRIBUTION_SECONDS * 1000)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export const sourceCookieName = (eventId: number) =>
  `ait-event-source-${eventId}`;

export function sourceFromHeaders(
  headers: Headers,
  eventId: number,
  secret: string,
  now = Date.now(),
) {
  const name = `${sourceCookieName(eventId)}=`;
  const value = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))
    ?.slice(name.length);
  const token = readSourceToken(value, secret, now);
  return token?.purpose === "cookie" && token.eventId === eventId
    ? token
    : null;
}
