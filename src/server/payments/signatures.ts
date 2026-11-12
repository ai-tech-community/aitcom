import { createHmac, timingSafeEqual } from "node:crypto";

function sameSignature(
  expected: string,
  supplied: string,
  encoding: "hex" | "base64",
) {
  const a = Buffer.from(expected, encoding);
  const b = Buffer.from(supplied, encoding);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function verifyStripeSignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
): boolean {
  const parts = header.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return parts.some(
    ([key, value]) =>
      key === "v1" && !!value && sameSignature(expected, value, "hex"),
  );
}

export interface AdyenNotification {
  pspReference: string;
  originalReference?: string;
  merchantAccountCode: string;
  merchantReference: string;
  amount: { value: number; currency: string };
  eventCode: string;
  success: string;
  eventDate?: string;
  additionalData?: Record<string, string>;
}

export function verifyAdyenSignature(
  item: AdyenNotification,
  secret: string,
): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) return false;
  const signed = [
    item.pspReference,
    item.originalReference ?? "",
    item.merchantAccountCode,
    item.merchantReference,
    String(item.amount.value),
    item.amount.currency,
    item.eventCode,
    item.success,
  ]
    .map((part) => part.replace(/\\/g, "\\\\").replace(/:/g, "\\:"))
    .join(":");
  const expected = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(signed)
    .digest("base64");
  return sameSignature(
    expected,
    item.additionalData?.hmacSignature ?? "",
    "base64",
  );
}
