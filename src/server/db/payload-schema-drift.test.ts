import { describe, expect, it } from "vitest";

import {
  findMissingColumns,
  GUARDED_PAYLOAD_TABLES,
} from "./payload-schema-drift";

describe("GUARDED_PAYLOAD_TABLES", () => {
  it("checks the feed post and gallery tables", () => {
    expect(GUARDED_PAYLOAD_TABLES).toEqual(
      expect.arrayContaining([
        "feed_posts",
        "gallery_items",
        "gallery_batches",
        "gallery_reports",
      ]),
    );
  });
});

describe("findMissingColumns", () => {
  it("names each expected column the database lacks", () => {
    expect(
      findMissingColumns(
        {
          payload_locked_documents_rels: ["id", "users_id", "points_boosts_id"],
        },
        [
          { table: "payload_locked_documents_rels", column: "id" },
          { table: "payload_locked_documents_rels", column: "users_id" },
        ],
      ),
    ).toEqual(["payload_locked_documents_rels.points_boosts_id"]);
  });

  it("is empty when every expected column exists, extra columns allowed", () => {
    expect(
      findMissingColumns({ t: ["a"] }, [
        { table: "t", column: "a" },
        { table: "t", column: "legacy" },
      ]),
    ).toEqual([]);
  });

  it("does not accept a same-named column from another table", () => {
    expect(
      findMissingColumns({ t: ["a"] }, [{ table: "other", column: "a" }]),
    ).toEqual(["t.a"]);
  });
});
