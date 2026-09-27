import { describe, expect, it } from "vitest";

import { findMissingColumns } from "./payload-schema-drift";

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
