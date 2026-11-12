import { type z } from "zod";

/** Never surface provider response bodies: they can contain account/customer data. */
export async function providerRequest<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Payment provider request failed (${response.status}).`);
  return schema.parse(await response.json());
}

export function paymentAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  if (!url)
    throw new Error("Configure the application URL before enabling payments.");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && parsed.hostname === "localhost")
  ) {
    throw new Error("Payments require a secure application URL.");
  }
  return parsed.origin;
}

export function requiredPaymentEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("This payment provider is not configured.");
  return value;
}
