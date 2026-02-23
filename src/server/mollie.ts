import { createMollieClient, type MollieClient } from "@mollie/api-client";
import { env } from "@/env";

let mollieInstance: MollieClient | null = null;

export function getMollie(): MollieClient | null {
  if (!env.MOLLIE_API_KEY) return null;
  if (!mollieInstance) {
    mollieInstance = createMollieClient({ apiKey: env.MOLLIE_API_KEY });
  }
  return mollieInstance;
}
