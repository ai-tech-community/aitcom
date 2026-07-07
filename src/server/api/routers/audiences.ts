import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";

export const audiencesRouter = createTRPCRouter({
  /**
   * PUBLIC: the full audience vocabulary (slug + display name), ordered by
   * name. Backs the event form's audience chip picker; cacheable since
   * audiences are editorial/slow-moving.
   */
  list: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "audiences",
      sort: "name",
      limit: 100,
      depth: 0,
    });

    return docs.map((doc) => ({
      id: doc.id,
      slug: doc.slug,
      name: doc.name,
    }));
  }),
});
