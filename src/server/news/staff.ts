import { getPayloadClient } from "@/server/payload";

import { isNewsStaffRole } from "./rumor-rules";

/** Platform staff are Payload users with role admin or editor. */
export async function isNewsStaff(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  try {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "users",
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
    });
    const role = docs[0]?.role;
    return isNewsStaffRole(typeof role === "string" ? role : null);
  } catch (err) {
    console.error("news: could not read the staff role", err);
    return false;
  }
}
