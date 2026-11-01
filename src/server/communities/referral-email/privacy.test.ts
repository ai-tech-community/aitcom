// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrubJoinedReferralEmails } from "./privacy";
import { referralEmailInvites } from "@/server/db/schema";
afterEach(() => vi.unstubAllEnvs());
describe("recipient privacy on every join route", () => {
  it("does no new work on ordinary joins without configured signing", async () => {
    vi.stubEnv("REFERRAL_INVITE_SECRET", "");
    const db = { select: vi.fn(), update: vi.fn() };
    await scrubJoinedReferralEmails(db as never, "user", "community");
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
  it("scrubs only delivery data and leaves actual membership attribution alone", async () => {
    vi.stubEnv(
      "REFERRAL_INVITE_SECRET",
      "stable-referral-signing-secret-over-32",
    );
    const set = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const select = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      limit: vi
        .fn()
        .mockResolvedValue([{ email: "friend@example.com", invitedBy: null }]),
    };
    select.from.mockReturnValue(select);
    select.innerJoin.mockReturnValue(select);
    select.where.mockReturnValue(select);
    const db = {
      select: vi.fn().mockReturnValue(select),
      update: vi.fn().mockReturnValue({ set }),
    };
    await scrubJoinedReferralEmails(db as never, "friend", "community");
    expect(db.update).toHaveBeenCalledExactlyOnceWith(referralEmailInvites);
    expect(set.mock.calls[0]![0]).toMatchObject({
      recipientEmail: null,
      leaseUntil: null,
    });
    expect(set.mock.calls[0]![0]).not.toHaveProperty("invitedBy");
  });
});
