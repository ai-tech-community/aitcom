import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canReadPaidCommunity,
  coursePurchaseAllowed,
  membershipPaymentAllowed,
} from "./access";

function database(responses: unknown[][]) {
  const selections: unknown[] = [];
  const select = vi.fn(() => {
    const response = responses.shift() ?? [];
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn((condition) => {
        selections.push(condition);
        return chain;
      }),
      limit: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(response).then(resolve),
    };
    return chain;
  });
  return { db: { select } as never, select, selections };
}
afterEach(() => vi.unstubAllEnvs());

describe("payment access boundaries", () => {
  it("does not query new tables before rollout is enabled", async () => {
    const fake = database([]);
    expect(await membershipPaymentAllowed(fake.db, "community", "user")).toBe(
      true,
    );
    expect(fake.select).not.toHaveBeenCalled();
  });
  it("keeps complimentary members independent of subscriptions", async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "true");
    const fake = database([
      [{ paidEntryAt: new Date() }],
      [{ userId: "member" }],
    ]);
    expect(await membershipPaymentAllowed(fake.db, "community", "member")).toBe(
      true,
    );
    expect(fake.select).toHaveBeenCalledTimes(2);
  });
  it("denies expired members and accepts a recovered paid period", async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "true");
    const now = new Date("2026-12-10T00:00:00Z");
    const expired = database([
      [{ paidEntryAt: now }],
      [],
      [
        {
          subscription: {
            paidThrough: new Date("2026-12-01"),
            status: "past_due",
            cancelAtPeriodEnd: false,
          },
        },
      ],
    ]);
    expect(
      await membershipPaymentAllowed(expired.db, "community", "member", now),
    ).toBe(false);
    const recovered = database([
      [{ paidEntryAt: now }],
      [],
      [
        {
          subscription: {
            paidThrough: new Date("2027-01-01"),
            status: "active",
            cancelAtPeriodEnd: false,
          },
        },
      ],
    ]);
    expect(
      await membershipPaymentAllowed(recovered.db, "community", "member", now),
    ).toBe(true);
  });
  it("a paid policy denies anonymous and banned community readers", async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "true");
    expect(
      await canReadPaidCommunity(
        database([[{ paidEntryAt: new Date() }]]).db,
        "community",
        null,
      ),
    ).toBe(false);
    expect(
      await canReadPaidCommunity(
        database([
          [{ paidEntryAt: new Date() }],
          [{ status: "banned", role: "member" }],
        ]).db,
        "community",
        "buyer",
      ),
    ).toBe(false);
  });
  it("a paid course requires a fulfilled purchase and never grants access to anonymous readers", async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "true");
    expect(
      await coursePurchaseAllowed(
        database([[{ id: "offer" }]]).db,
        "community",
        1,
        null,
      ),
    ).toBe(false);
    expect(
      await coursePurchaseAllowed(
        database([[{ id: "offer" }], []]).db,
        "community",
        1,
        "member",
      ),
    ).toBe(false);
    expect(
      await coursePurchaseAllowed(
        database([[{ id: "offer" }], [{ id: "paid-order" }]]).db,
        "community",
        1,
        "buyer",
      ),
    ).toBe(true);
  });
});
