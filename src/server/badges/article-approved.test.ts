// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduled: (() => unknown)[] = [];
const after = vi.fn((work: () => unknown) => {
  scheduled.push(work);
});
vi.mock("next/server", () => ({ after }));
const evaluateBadges = vi.fn(async () => ({
  ok: true,
  earned: [],
  celebrated: [],
}));
const awardMilestone = vi.fn(async () => true);
vi.mock("@/server/badges/engine", () => ({ evaluateBadges, awardMilestone }));

const { onArticleApprovedAfterSave } =
  await import("@/server/badges/article-approved");

const db = {} as never;
const req = { transactionID: "tx-1" } as never;
const tutorial = { authorId: "a1", type: "tutorial" };

describe("onArticleApprovedAfterSave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduled.length = 0;
  });

  it("in a request, earns after the response, once Payload has committed", async () => {
    await onArticleApprovedAfterSave(db, tutorial, req);
    expect(evaluateBadges).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]!();
    // After the commit the article is visible without the save's request.
    expect(evaluateBadges).toHaveBeenCalledWith(db, "a1", ["writer"], {});
    expect(awardMilestone).toHaveBeenCalledWith(db, "a1", "tutorial_creator");
  });

  it("outside a request, earns now, reading through the save's request", async () => {
    after.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    await onArticleApprovedAfterSave(
      db,
      { authorId: "a1", type: "article" },
      req,
    );
    expect(evaluateBadges).toHaveBeenCalledWith(db, "a1", ["writer"], { req });
    expect(awardMilestone).not.toHaveBeenCalled();
  });
});
