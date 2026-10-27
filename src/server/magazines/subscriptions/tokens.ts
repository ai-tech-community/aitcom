import { createHash, randomBytes } from "node:crypto";

export function hashConfirmToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newConfirmToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashConfirmToken(token) };
}
