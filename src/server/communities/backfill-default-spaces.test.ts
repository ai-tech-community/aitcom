import { expect, it } from "vitest";

import {
  backfillWrites,
  communitiesWithoutSpaces,
} from "./backfill-default-spaces";

it("is a dry run unless --write is passed", () => {
  expect(backfillWrites([])).toBe(false);
  expect(backfillWrites(["--dry-run"])).toBe(false);
  expect(backfillWrites(["--write"])).toBe(true);
});

it("only selects communities that have no spaces", () => {
  const rows = [
    { id: "2ce62767-8286-47bb-9451-a7adb4605b29", spaceCount: 0 },
    { id: "has-nav", spaceCount: 6 },
  ];
  expect(communitiesWithoutSpaces(rows).map((row) => row.id)).toEqual([
    "2ce62767-8286-47bb-9451-a7adb4605b29",
  ]);
});
