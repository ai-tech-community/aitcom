// Centralized Payload client - caches the instance after first init.
import { getPayload } from "payload";
import type { Payload } from "payload";
import config from "@payload-config";

let cached: Payload | null = null;

export async function getPayloadClient(): Promise<Payload> {
  if (cached) return cached;
  const payload = await getPayload({ config });
  cached = payload;
  return payload;
}
