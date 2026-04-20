/**
 * Backfill geocoding coordinates for existing events.
 *
 * Uses Nominatim (1 req/s). Skips events already geocoded.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-event-geocoding.ts
 */

import { getPayload } from "payload";
import config from "@payload-config";

import { geocodeEvent } from "@/server/geocoding/nominatim";

interface EventRow {
  id: number;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

async function main() {
  const payload = await getPayload({ config });

  const { docs } = await payload.find({
    collection: "events",
    limit: 1000,
    depth: 0,
    pagination: false,
  });

  const events = docs as unknown as EventRow[];
  const toProcess = events.filter(
    (e) => e.latitude == null || e.longitude == null,
  );

  console.log(`Events total=${events.length} needGeocode=${toProcess.length}`);

  let ok = 0;
  let fail = 0;

  for (const event of toProcess) {
    const result = await geocodeEvent(event);
    if (!result) {
      console.log(`[${event.id}] no match for location fields`);
      fail++;
      continue;
    }

    await payload.update({
      collection: "events",
      id: event.id,
      data: {
        latitude: result.latitude,
        longitude: result.longitude,
        geocodedAt: new Date().toISOString(),
      },
      context: { skipGeocode: true },
    });

    console.log(
      `[${event.id}] ok lat=${result.latitude.toFixed(4)} lng=${result.longitude.toFixed(4)} -> ${result.displayName}`,
    );
    ok++;
  }

  console.log(`Done. ok=${ok} fail=${fail}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
