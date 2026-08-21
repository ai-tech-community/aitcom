/**
 * Payload postgres maps `type: "number"` to `numeric`, and the adapter often
 * returns those columns as strings. `"0" + 1 === "01"`, which fails Payload
 * number validation and — when it happens inside an afterChange hook — rolls
 * back the parent create. Always coerce before arithmetic.
 */
export function incrementNumeric(value: unknown, delta = 1): number {
  const n = typeof value === "number" ? value : Number(value);
  const base = Number.isFinite(n) ? n : 0;
  return Math.max(0, base + delta);
}

/** Surface a Payload / unknown throw as a user-visible TRPC message. */
export function payloadWriteMessage(
  err: unknown,
  fallback = "Failed to save. Please try again.",
): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object") {
    const rec = err as {
      message?: unknown;
      data?: { errors?: { message?: string }[] };
    };
    const details = rec.data?.errors
      ?.map((e) => e.message)
      .filter((m): m is string => Boolean(m?.trim()))
      .join("; ");
    if (details) return details;
    if (typeof rec.message === "string" && rec.message.trim())
      return rec.message;
  }
  return fallback;
}
