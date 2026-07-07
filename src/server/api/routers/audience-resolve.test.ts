import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";

import { resolveAudienceIds } from "./audience-resolve";

function mockPayload(docs: Array<{ id: number; slug: string }>) {
  const find = vi.fn().mockResolvedValue({ docs });
  return { find } as unknown as Payload;
}

describe("resolveAudienceIds", () => {
  it("resolves known slugs to ids via a single where:{slug:{in}} query", async () => {
    const payload = mockPayload([
      { id: 1, slug: "engineers" },
      { id: 2, slug: "founders" },
    ]);

    const ids = await resolveAudienceIds(payload, ["engineers", "founders"]);

    expect(ids).toEqual([1, 2]);
    expect(payload.find).toHaveBeenCalledTimes(1);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "audiences",
        where: { slug: { in: ["engineers", "founders"] } },
      }),
    );
  });

  it("silently drops unknown slugs, keeping only matched ids", async () => {
    const payload = mockPayload([{ id: 1, slug: "engineers" }]);

    const ids = await resolveAudienceIds(payload, [
      "engineers",
      "not-a-real-slug",
    ]);

    expect(ids).toEqual([1]);
  });

  it("resolves to undefined when no slugs are provided", async () => {
    const payload = mockPayload([]);

    expect(await resolveAudienceIds(payload, undefined)).toBeUndefined();
    expect(await resolveAudienceIds(payload, [])).toBeUndefined();
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("resolves to undefined when none of the given slugs match", async () => {
    const payload = mockPayload([]);

    const ids = await resolveAudienceIds(payload, ["not-a-real-slug"]);

    expect(ids).toBeUndefined();
  });
});
