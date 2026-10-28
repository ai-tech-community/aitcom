import { TRPCError } from "@trpc/server";

import { getPayloadClient } from "@/server/payload";

/** Block a post until the member has accepted the community's current rules. */
export async function requireRulesAcceptance(
  userId: string,
  communityId?: string,
) {
  if (!communityId) return;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "community-rules",
    where: { communityId: { equals: communityId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (docs.length === 0) return;

  const rules = docs[0]!;

  const { docs: acceptanceDocs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
        { communityId: { equals: communityId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (acceptanceDocs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}
