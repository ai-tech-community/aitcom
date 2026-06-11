import { describe, expect, it } from "vitest";
import { buildIdeasWhere } from "./ideas-filter";

describe("buildIdeasWhere", () => {
  it("scopes to a community when communityId is given", () => {
    expect(buildIdeasWhere({ communityId: "c1" })).toEqual({
      communityId: { equals: "c1" },
    });
  });

  it("scopes to hub (communityId absent) when no communityId", () => {
    expect(buildIdeasWhere({})).toEqual({
      communityId: { exists: false },
    });
  });

  it("ands a category filter when given", () => {
    expect(buildIdeasWhere({ category: "agent-capability" })).toEqual({
      and: [
        { communityId: { exists: false } },
        { category: { equals: "agent-capability" } },
      ],
    });
  });

  it("ands community and category when both are given", () => {
    expect(
      buildIdeasWhere({ communityId: "c1", category: "platform" }),
    ).toEqual({
      and: [
        { communityId: { equals: "c1" } },
        { category: { equals: "platform" } },
      ],
    });
  });
});
