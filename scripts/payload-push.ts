/**
 * Materialise the Payload `public` schema from the Payload config.
 *
 * The committed Payload migrations are incremental patches with no
 * base-table migration, so a fresh database is built by Payload's dev `push`
 * (enabled via PAYLOAD_PUSH). Initialising Payload here runs that push, after
 * which the Payload-based seeds have tables to write to.
 *
 * No-op unless PAYLOAD_PUSH=true (push is off in production).
 *
 * Run with:  PAYLOAD_PUSH=true tsx scripts/payload-push.ts
 */
import config from "@payload-config";
import { getPayload } from "payload";

async function main() {
  if (process.env.PAYLOAD_PUSH !== "true") {
    console.log("PAYLOAD_PUSH not set; skipping Payload schema push.");
    return;
  }
  console.log("Pushing Payload 'public' schema from config...");
  await getPayload({ config });
  console.log("Payload schema ready.");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Payload push failed:", err);
    process.exit(1);
  });
