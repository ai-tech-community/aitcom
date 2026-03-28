import { z } from "zod";
import type { Where } from "payload";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import {
  sendSponsorApplicationConfirmation,
  sendSponsorApplicationNotification,
} from "@/server/email";

export const sponsorsRouter = createTRPCRouter({
  /** Get all active sponsors, ordered by tier (gold first). */
  list: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "sponsors",
      where: { status: { equals: "active" } },
      sort: "tier",
      limit: 100,
    });
    return docs;
  }),

  /** Get featured sponsors for homepage strip. */
  featured: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "sponsors",
      where: {
        status: { equals: "active" },
        featured: { equals: true },
      },
      limit: 20,
    });
    return docs;
  }),

  /** Submit a sponsor application (requires authentication). */
  submitApplication: protectedProcedure
    .input(
      z.object({
        companyName: z.string().min(1).max(200),
        website: z.string().url().optional().or(z.literal("")),
        contactName: z.string().min(1).max(200),
        contactEmail: z.string().email(),
        tier: z.enum(["gold", "silver", "bronze"]),
        message: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = await getPayloadClient();

      const application = await payload.create({
        collection: "sponsor-applications",
        data: {
          companyName: input.companyName,
          website: input.website ?? "",
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          tier: input.tier,
          message: input.message ?? "",
          status: "pending",
        },
      });

      const emailData = {
        companyName: input.companyName,
        tier: input.tier,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
      };

      // Fire emails async (don't block response)
      void (async () => {
        try {
          await sendSponsorApplicationConfirmation(
            input.contactEmail,
            input.contactName,
            emailData,
          );
          await sendSponsorApplicationNotification(emailData);
        } catch (e) {
          console.error("Failed to send sponsor application emails:", e);
        }
      })();

      return { success: true, applicationId: application.id };
    }),

  /** Get active jobs with optional filters. */
  jobs: publicProcedure
    .input(
      z
        .object({
          type: z.enum(["remote", "hybrid", "onsite"]).optional(),
          limit: z.number().default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const where: Where = {
        status: { equals: "active" },
        ...(input?.type ? { type: { equals: input.type } } : {}),
      };

      const { docs } = await payload.find({
        collection: "jobs",
        where,
        sort: "-postedAt",
        limit: input?.limit ?? 20,
        depth: 1,
      });
      return docs;
    }),
});
