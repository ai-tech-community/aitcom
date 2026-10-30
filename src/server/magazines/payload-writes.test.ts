import { describe, expect, it } from "vitest";

import { isConcurrencyAbort } from "./payload-writes";

describe("isConcurrencyAbort", () => {
  it("finds a deadlock or serialization failure however deeply wrapped", () => {
    expect(isConcurrencyAbort({ code: "40P01" })).toBe(true);
    expect(
      isConcurrencyAbort(new Error("x", { cause: { code: "40001" } })),
    ).toBe(true);
    expect(
      isConcurrencyAbort(
        new Error("payload", {
          cause: new Error("driver", { cause: { code: "40P01" } }),
        }),
      ),
    ).toBe(true);
  });

  it("is false for other errors", () => {
    expect(isConcurrencyAbort({ code: "23505" })).toBe(false);
    expect(isConcurrencyAbort(new Error("boom"))).toBe(false);
    expect(isConcurrencyAbort(null)).toBe(false);
  });
});
