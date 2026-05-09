import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";

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

interface RecordedUpdateArgs {
  entityType: EntityType;
  entityId: string;
  patch: Record<string, unknown>;
  sources: Source[];
  reason?: string;
}

export async function recordedUpdate(
  ctx: RecordedWriteCtx,
  args: RecordedUpdateArgs,
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
    validateFieldWhitelist(cfg, args.patch);
    validateAdminOnlyFields(cfg, args.patch, { isAdmin: ctx.isAdmin });
    validateCitationRule(cfg, "update", args.patch, args.sources);
  } catch (e) {
    throw mapValidationError(e);
  }

  return await dbi.transaction(async (tx) => {
    const beforeRow = await tx
      .select()
      .from(cfg.table)
      // @ts-expect-error polymorphic table — id column known via cfg
      .where(eq(cfg.table.id, args.entityId))
      .limit(1);

    if (beforeRow.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found." });
    }

    const before: Record<string, unknown> = {};
    for (const key of Object.keys(args.patch)) {
      before[key] = (beforeRow[0] as Record<string, unknown>)[key];
    }

    await tx
      .update(cfg.table)
      .set(args.patch as never)
      // @ts-expect-error polymorphic table — id column known via cfg
      .where(eq(cfg.table.id, args.entityId));

    const [edit] = await tx
      .insert(investigationEdit)
      .values({
        entityType: args.entityType,
        entityId: args.entityId,
        op: "update",
        patch: args.patch,
        before,
        sources: args.sources,
        userId: ctx.userId,
        agentId: ctx.agentId ?? null,
        status: "live",
      })
      .returning({ id: investigationEdit.id });

    return { entity: { id: args.entityId }, editId: edit!.id };
  });
}

interface RecordedDeleteArgs {
  entityType: EntityType;
  entityId: string;
  reason: string;
}

export async function recordedDelete(
  ctx: RecordedWriteCtx,
  args: RecordedDeleteArgs,
): Promise<{ editId: string }> {
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Delete is admin-only.",
    });
  }

  const cfg = ENTITY_CONFIG[args.entityType];
  const dbi = ctx.db ?? defaultDb;

  return await dbi.transaction(async (tx) => {
    const beforeRow = await tx
      .select()
      .from(cfg.table)
      // @ts-expect-error polymorphic table — id column known via cfg
      .where(eq(cfg.table.id, args.entityId))
      .limit(1);

    if (beforeRow.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found." });
    }

    await tx
      .delete(cfg.table)
      // @ts-expect-error polymorphic table — id column known via cfg
      .where(eq(cfg.table.id, args.entityId));

    const [edit] = await tx
      .insert(investigationEdit)
      .values({
        entityType: args.entityType,
        entityId: args.entityId,
        op: "delete",
        patch: {},
        before: beforeRow[0] as Record<string, unknown>,
        sources: [],
        userId: ctx.userId,
        agentId: ctx.agentId ?? null,
        status: "live",
      })
      .returning({ id: investigationEdit.id });

    return { editId: edit!.id };
  });
}
