import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/payments/access", () => ({
  canReadPaidCommunity: vi.fn().mockResolvedValue(false),
  membershipPaymentAllowed: vi.fn(),
  paymentsEnabled: () => true,
}));
import {
  viewerCanReadContent,
  viewerCanReadRoster,
} from "./content-visibility-queries";
import { requireViewablePost } from "./feed-posts";

describe("paid community public read shortcuts", () => {
  it("does not expose listed content or roster before paid admission", async () => {
    const community = { id: "paid", slug: "paid", isListedInDirectory: true };
    expect(
      await viewerCanReadContent({} as never, community, "expired-member"),
    ).toBe(false);
    expect(await viewerCanReadRoster({} as never, community, null)).toBe(false);
  });
  it("refuses even a public feed post from a paid community", async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 1,
        communityId: "paid",
        visibility: "public",
        isDeleted: false,
      }),
    };
    await expect(
      requireViewablePost({} as never, payload as never, 1, "expired-member"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
