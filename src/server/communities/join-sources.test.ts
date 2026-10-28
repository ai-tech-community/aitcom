import { afterEach, describe, expect, it, vi } from "vitest";

import type { Deps } from "@/server/magazines/deps";
import { JOIN_SOURCE_VERIFIERS, verifyJoinSource } from "./join-sources";

afterEach(() => vi.restoreAllMocks());

describe("verifyJoinSource", () => {
  it("drops the source and logs when the verifier throws", async () => {
    vi.spyOn(JOIN_SOURCE_VERIFIERS, "magazine").mockRejectedValue(
      new Error("unavailable"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await verifyJoinSource({} as Deps, "c", {
        via: "magazine",
        magazineId: 1,
        issueId: 2,
      }),
    ).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });
});
