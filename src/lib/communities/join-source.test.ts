import { describe, expect, it } from "vitest";

import { joinSourceSchema } from "./join-source";

describe("joinSourceSchema", () => {
  it("accepts magazine sources with positive integer ids", () => {
    const source = { via: "magazine", magazineId: 1, issueId: 2 };
    expect(joinSourceSchema.parse(source)).toEqual(source);
  });

  it.each([
    { via: "other", magazineId: 1, issueId: 2 },
    { via: "magazine", magazineId: 0, issueId: 2 },
    { via: "magazine", magazineId: 1, issueId: -1 },
    { via: "magazine", magazineId: 1, issueId: 1.5 },
    { via: "magazine", magazineId: "1", issueId: 2 },
  ])("rejects malformed sources: %j", (source) => {
    expect(joinSourceSchema.safeParse(source).success).toBe(false);
  });
});
