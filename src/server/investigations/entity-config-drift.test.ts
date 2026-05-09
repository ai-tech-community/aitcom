import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ENTITY_CONFIG, ENTITY_TYPES } from "./entity-config";

describe("ENTITY_CONFIG drift vs Drizzle schema", () => {
  for (const entityType of ENTITY_TYPES) {
    const cfg = ENTITY_CONFIG[entityType];
    const realColumns = new Set(Object.keys(getTableColumns(cfg.table)));

    it(`${entityType}: every editableFields entry is a real column`, () => {
      const missing: string[] = [];
      for (const field of cfg.editableFields) {
        if (!realColumns.has(field)) missing.push(field);
      }
      expect(
        missing,
        `Fields in editableFields not present on table: ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it(`${entityType}: every factualFields entry is a real column`, () => {
      const missing: string[] = [];
      for (const field of cfg.factualFields) {
        if (!realColumns.has(field)) missing.push(field);
      }
      expect(missing).toEqual([]);
    });

    it(`${entityType}: every adminOnlyFields entry is a real column`, () => {
      const missing: string[] = [];
      for (const field of cfg.adminOnlyFields) {
        if (!realColumns.has(field)) missing.push(field);
      }
      expect(missing).toEqual([]);
    });
  }
});
