import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
} from "payload";

import { db } from "@/server/db";
import { seedQueuedRunsForApprovedPrompt } from "@/server/benchmark/seed-queued-runs";

const autoApprovalHook: CollectionBeforeChangeHook = ({
  data,
  req,
  operation,
}) => {
  if (
    operation === "update" &&
    data?.status === "approved" &&
    !data.approvedByUser &&
    req.user
  ) {
    data.approvedByUser = req.user.id;
    data.approvedAt = new Date().toISOString();
  }
  return data;
};

/**
 * When a prompt transitions to approved, queue one benchmark_run per enabled
 * model surface (filtered by surface allowed-locales). See ADR-0005 and
 * the brand-benchmark rebuild plan step 5.
 *
 * Errors are logged, not thrown: the prompt approval has already committed
 * by the time afterChange fires; throwing here would leave the prompt
 * approved with no auto-seeded runs and no signal to the moderator.
 * A periodic reconciler can catch any missed approvals.
 */
const seedRunsOnApprovalHook: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const transitionedToApproved =
    doc?.status === "approved" &&
    (operation === "create" || previousDoc?.status !== "approved");
  if (!transitionedToApproved) return doc;
  if (!doc.locale) return doc;

  try {
    const result = await seedQueuedRunsForApprovedPrompt(db, {
      promptId: String(doc.id),
      locale: String(doc.locale),
    });
    req.payload.logger.info(
      {
        promptId: doc.id,
        seeded: result.seeded,
        skippedExisting: result.skippedExisting,
        skippedLocale: result.skippedLocale,
      },
      "benchmark prompt auto-seed",
    );
  } catch (err) {
    req.payload.logger.error(
      { err, promptId: doc.id },
      "benchmark prompt auto-seed failed",
    );
  }

  return doc;
};

export const BenchmarkPrompts: CollectionConfig = {
  slug: "benchmark-prompts",
  dbName: "benchmark_prompt",
  admin: {
    useAsTitle: "text",
    defaultColumns: [
      "text",
      "status",
      "category",
      "intent",
      "submittedByUser",
      "createdAt",
    ],
    description:
      "Crowd-sourced prompts awaiting moderator approval before entering the benchmark.",
  },
  access: {
    read: () => true,
    create: () => false,
    update: ({ req }) => req.user?.role === "admin",
    delete: () => false,
  },
  hooks: {
    beforeChange: [autoApprovalHook],
    afterChange: [seedRunsOnApprovalHook],
  },
  fields: [
    {
      name: "text",
      type: "textarea",
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "benchmark-categories",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "intent",
      type: "relationship",
      relationTo: "benchmark-intents",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "locale",
      type: "text",
      required: true,
      defaultValue: "en-US",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "submittedByUser",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "approvedByUser",
      type: "relationship",
      relationTo: "users",
      admin: { position: "sidebar" },
    },
    {
      name: "approvedAt",
      type: "date",
      admin: { position: "sidebar" },
    },
    {
      name: "notes",
      type: "textarea",
      admin: { description: "Internal moderation notes." },
    },
  ],
};
