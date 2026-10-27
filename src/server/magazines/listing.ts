import type { Magazine } from "@/payload-types";

import type { PayloadClient } from "./deps";

/** Ids of magazines staff hid from the Magazines page (Decision 14). */
export async function hiddenMagazineIds(
  payload: Pick<PayloadClient, "find">,
): Promise<number[]> {
  const { docs } = await payload.find({
    collection: "magazines",
    where: { listingHidden: { equals: true } },
    pagination: false,
    depth: 0,
    select: { listingHidden: true },
  });
  return docs.map((magazine) => Number(magazine.id));
}

/** Decision 14: the derived fact is `staffHidden`, never "listed". */
export function isHiddenByStaff(
  magazine: Pick<Magazine, "listingHidden">,
): boolean {
  return magazine.listingHidden === true;
}
