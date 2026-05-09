import type { EntityConfig } from "./entity-config";

export class FieldNotEditableError extends Error {
  constructor(public field: string) {
    super(`Field is not editable: ${field}`);
  }
}

export class AdminOnlyFieldError extends Error {
  constructor(public field: string) {
    super(`Field requires admin: ${field}`);
  }
}

export class CitationRequiredError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type Op = "create" | "update" | "delete" | "revert";

export interface Source {
  url: string;
  title?: string;
  type?: string;
  publishedAt?: string;
}

export function validateFieldWhitelist(
  cfg: EntityConfig,
  patch: Record<string, unknown>,
): void {
  for (const key of Object.keys(patch)) {
    if (!cfg.editableFields.has(key)) {
      throw new FieldNotEditableError(key);
    }
  }
}

export function validateAdminOnlyFields(
  cfg: EntityConfig,
  patch: Record<string, unknown>,
  ctx: { isAdmin: boolean },
): void {
  if (ctx.isAdmin) return;
  for (const key of Object.keys(patch)) {
    if (cfg.adminOnlyFields.has(key)) {
      throw new AdminOnlyFieldError(key);
    }
  }
}

export function validateCitationRule(
  cfg: EntityConfig,
  op: Op,
  patch: Record<string, unknown>,
  sources: Source[],
): void {
  if (op === "create") {
    if (sources.length === 0) {
      throw new CitationRequiredError(
        "At least one source URL is required when creating a new record.",
      );
    }
    return;
  }

  if (op === "update") {
    const touchesFactual = Object.keys(patch).some((f) =>
      cfg.factualFields.has(f),
    );
    if (touchesFactual && sources.length === 0) {
      throw new CitationRequiredError(
        "At least one source URL is required when updating a factual field.",
      );
    }
  }
}
