import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, publish, revalidate } = vi.hoisted(() => ({
  transaction: vi.fn(),
  publish: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: { transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/lib/investigations/datacenter-facilities", () => ({
  publishFacilityWithRepo: publish,
}));

import { publishDatacenterFacilityFromRequest } from "./publish-facility";

beforeEach(() => vi.clearAllMocks());

describe("facility editor transaction", () => {
  it("uses the Payload save transaction without committing an independent write", async () => {
    const limit = vi.fn(async () => []);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const req = {
      transactionID: Promise.resolve("save-tx"),
      payload: { db: { sessions: { "save-tx": { db: { select } } } } },
    };
    publish.mockImplementation(async (_input, repo) => {
      await repo.slugTaken("fairwater");
      return { ok: true, slug: "fairwater" };
    });
    await expect(
      publishDatacenterFacilityFromRequest({}, req as never),
    ).resolves.toMatchObject({ ok: true });
    expect(select).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses to publish when there is no active Payload save transaction", async () => {
    await expect(
      publishDatacenterFacilityFromRequest({}, {
        payload: { db: { sessions: {} } },
      } as never),
    ).rejects.toThrow("transaction");
    expect(publish).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
