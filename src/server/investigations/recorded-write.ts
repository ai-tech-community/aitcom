import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

import { db as defaultDb } from "@/server/db";
import { investigationEdit } from "@/server/db/schema";

import { ENTITY_CONFIG, type EntityType } from "./entity-config";
import { checkInvestigationEditLimit } from "./rate-limit";
import {
  AdminOnlyFieldError,
  CitationRequiredError,
  FieldNotEditableError,
  validateAdminOnlyFields,
  validateCitationRule,
  validateFieldWhitelist,
  type Source,
} from "./validate";

export interface RecordedWriteCtx {
  userId: string;
  agentId?: string;
  isAdmin: boolean;
  db?: typeof defaultDb;
}

interface RecordedCreateArgs<T extends Record<string, unknown>> {
  entityType: EntityType;
  values: T;
  sources: Source[];
}

export async function recordedCreate<T extends Record<string, unknown>>(
  ctx: RecordedWriteCtx,
  args: RecordedCreateArgs<T>,
): Promise<{ entity: { id: string }; editId: string }> {
  const cfg = ENTITY_CONFIG[args.entityType];
  const dbi = ctx.db ?? defaultDb;

  const rate = checkInvestigationEditLimit(ctx.userId);
  if (!rate.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Edit rate limit exceeded.",
    });
  }

  try {
    validateFieldWhitelist(cfg, args.values);
    validateAdminOnlyFields(cfg, args.values, { isAdmin: ctx.isAdmin });
    validateCitationRule(cfg, "create", args.values, args.sources);
  } catch (e) {
    throw mapValidationError(e);
  }

  return await dbi.transaction(async (tx) => {
    const [created] = await tx
      .insert(cfg.table)
      .values(args.values as never)
      .returning({ id: sql<string>`id` });

    const [edit] = await tx
      .insert(investigationEdit)
      .values({
        entityType: args.entityType,
        entityId: created!.id,
        op: "create",
        patch: args.values as Record<string, unknown>,
        before: null,
        sources: args.sources,
        userId: ctx.userId,
        agentId: ctx.agentId ?? null,
        status: "live",
      })
      .returning({ id: investigationEdit.id });

    return { entity: { id: created!.id }, editId: edit!.id };
  });
}

export function mapValidationError(e: unknown): TRPCError {
  if (e instanceof FieldNotEditableError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: `Field not editable: ${e.field}`,
    });
  }
  if (e instanceof AdminOnlyFieldError) {
    return new TRPCError({
      code: "FORBIDDEN",
      message: `Field requires admin: ${e.field}`,
    });
  }
  if (e instanceof CitationRequiredError) {
    return new TRPCError({ code: "BAD_REQUEST", message: e.message });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected validation error.",
  });
}
