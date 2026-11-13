import { sql } from "@payloadcms/db-postgres";

import type {
  GalleryBatch,
  GalleryItem,
  HostedMaterial,
} from "@/payload-types";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * The collections whose rows move between statuses with a compare-and-set,
 * their tables, and the statuses and extra fields each one has.
 */
type Transitions = {
  "gallery-items": {
    status: GalleryItem["status"];
    set: { failureReason?: string };
  };
  "gallery-batches": {
    status: GalleryBatch["status"];
    set: Record<string, never>;
  };
  "hosted-materials": {
    status: HostedMaterial["status"];
    set: { failureReason?: string };
  };
};

const TABLES: Record<keyof Transitions, string> = {
  "gallery-items": "gallery_items",
  "gallery-batches": "gallery_batches",
  "hosted-materials": "hosted_materials",
};

/** Columns of the extra fields a transition may set alongside the status. */
const COLUMNS: Record<"failureReason", string> = {
  failureReason: "failure_reason",
};

/**
 * Moves one row from status `from` to status `to` — only if it is still in
 * `from` — in a single UPDATE, so of two requests racing on the same row
 * exactly one wins. Payload's `update({ where })` cannot do this: it finds
 * the matching rows first and writes each one by id afterwards, so two
 * requests can both see `from` and both "win".
 *
 * Returns whether this call moved the row. The row is written straight to
 * its table: the collections listed here have no hooks to run. Re-read the
 * document with `findByID` when its new state is needed.
 */
export async function transitionStatus<C extends keyof Transitions>(
  payload: Payload,
  input: {
    collection: C;
    id: number;
    from: Transitions[C]["status"];
    to: Transitions[C]["status"];
    set?: Transitions[C]["set"];
  },
): Promise<boolean> {
  const extra = Object.entries(input.set ?? {}).map(
    ([field, value]) =>
      sql`, ${sql.identifier(COLUMNS[field as keyof typeof COLUMNS])} = ${value}`,
  );
  const { rows } = await payload.db.drizzle.execute(sql`
    UPDATE ${sql.identifier(TABLES[input.collection])}
      SET "status" = ${input.to}${sql.join(extra)}, "updated_at" = now()
      WHERE "id" = ${input.id} AND "status" = ${input.from}
      RETURNING "id"
  `);
  return rows.length > 0;
}
