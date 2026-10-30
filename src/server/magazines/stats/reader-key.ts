import { createHmac } from "node:crypto";

/** BETTER_AUTH_SECRET, trimmed; null when unset (then nothing is recorded). */
export function readerKeySecret(
  env: { BETTER_AUTH_SECRET?: string } = {},
): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) return null;
  return secret;
}

/** A daily signed-out reader or a stable signed-in reader, without stored identity. */
export function readerKey(input: {
  viewerId: string | null;
  ip: string;
  userAgent: string;
  now: Date;
  secret: string;
}): string {
  const signedIn = input.viewerId !== null;
  const identity = signedIn
    ? `user|${input.viewerId}`
    : `anon|${input.now.toISOString().slice(0, 10)}|${input.ip}|${input.userAgent}`;
  const hash = createHmac("sha256", input.secret)
    .update(`magazine-reader|${identity}`)
    .digest("hex")
    .slice(0, 32);
  return `${signedIn ? "u" : "a"}${hash}`;
}
