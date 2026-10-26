import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import {
  MAGAZINE_ERROR_CODES,
  magazineError,
  magazineErrorItemIndex,
} from "./errors";

describe("magazineError", () => {
  it("uses the code as the message and a default tRPC code for every code", () => {
    for (const code of MAGAZINE_ERROR_CODES) {
      const err = magazineError(code);
      expect(err).toBeInstanceOf(TRPCError);
      expect(err.message).toBe(code);
      expect(err.code).toBeTruthy();
    }
    expect(magazineError("ISSUE_CHANGED").code).toBe("CONFLICT");
    expect(magazineError("ITEM_INVALID").code).toBe("BAD_REQUEST");
  });

  it("lets the caller override the tRPC code", () => {
    expect(magazineError("ISSUE_EMPTY", { trpcCode: "PRECONDITION_FAILED" }).code).toBe(
      "PRECONDITION_FAILED",
    );
  });

  it("carries the item index for the error formatter", () => {
    expect(magazineErrorItemIndex(magazineError("ITEM_INVALID", { itemIndex: 2 }))).toBe(2);
    expect(magazineErrorItemIndex(magazineError("ITEM_INVALID", { itemIndex: 0 }))).toBe(0);
    expect(magazineErrorItemIndex(magazineError("ISSUE_EMPTY"))).toBeNull();
    expect(magazineErrorItemIndex(new TRPCError({ code: "BAD_REQUEST" }))).toBeNull();
  });
});
