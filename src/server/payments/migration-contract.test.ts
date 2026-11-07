import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";

const tables = [
  schema.paymentConnections,
  schema.paymentOffers,
  schema.paymentPolicies,
  schema.paymentOrders,
  schema.paymentSubscriptions,
  schema.paymentBillingAttempts,
  schema.paymentEvents,
  schema.paymentRefunds,
  schema.paymentComplimentaryMembers,
  schema.paymentOutbox,
  schema.paymentCommands,
];
const migration = readFileSync(
  `${process.cwd()}/src/migrations/20261107a_community_payments.ts`,
  "utf8",
).split("export async function down")[0]!;

describe("unapplied payment migration contract (source only)", () => {
  for (const table of tables) {
    const config = getTableConfig(table);
    it(`defines every ${config.name} column with its application type and nullability`, () => {
      const start = migration.indexOf(
        `CREATE TABLE IF NOT EXISTS "app"."${config.name}" (`,
      );
      expect(start).toBeGreaterThan(-1);
      const block = migration.slice(
        start,
        migration.indexOf("\n    );", start),
      );
      for (const column of config.columns) {
        const name = column.name.replace(
          /[A-Z]/g,
          (letter) => `_${letter.toLowerCase()}`,
        );
        const line = block
          .split("\n")
          .find((value) => value.trimStart().startsWith(`"${name}" `));
        expect(line, column.name).toContain(`"${name}" ${column.getSQLType()}`);
        if (column.notNull) expect(line, column.name).toContain("NOT NULL");
      }
      for (const index of config.indexes)
        expect(migration).toContain(`"${index.config.name}"`);
    });
  }
});
