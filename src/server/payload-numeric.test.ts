import { describe, expect, it } from "vitest";
import { incrementNumeric, payloadWriteMessage } from "./payload-numeric";

describe("incrementNumeric", () => {
  it("increments a real number", () => {
    expect(incrementNumeric(0)).toBe(1);
    expect(incrementNumeric(4)).toBe(5);
  });

  it("does not concatenate a numeric string into '01'", () => {
    // The production forum_replies afterChange hook used
    // `(thread.replyCount ?? 0) + 1`. Payload returns numeric columns as
    // strings, so that became "01" and rolled the reply create back.
    expect(("0" as unknown as number) + 1).toBe("01");
    expect(incrementNumeric("0")).toBe(1);
    expect(incrementNumeric("2.00")).toBe(3);
  });

  it("treats null, undefined, and garbage as 0", () => {
    expect(incrementNumeric(null)).toBe(1);
    expect(incrementNumeric(undefined)).toBe(1);
    expect(incrementNumeric("")).toBe(1);
    expect(incrementNumeric("nope")).toBe(1);
    expect(incrementNumeric(NaN)).toBe(1);
  });

  it("decrements without going below 0", () => {
    expect(incrementNumeric(3, -1)).toBe(2);
    expect(incrementNumeric("0", -1)).toBe(0);
    expect(incrementNumeric(null, -1)).toBe(0);
  });
});

describe("payloadWriteMessage", () => {
  it("uses Error.message when present", () => {
    expect(
      payloadWriteMessage(
        new Error("The following field is invalid: Reply Count"),
      ),
    ).toBe("The following field is invalid: Reply Count");
  });

  it("falls back when the throw has no message (silent no-op class)", () => {
    expect(payloadWriteMessage({})).toBe("Failed to save. Please try again.");
    expect(payloadWriteMessage(null, "Couldn't post your reply.")).toBe(
      "Couldn't post your reply.",
    );
  });

  it("joins Payload ValidationError data.errors", () => {
    expect(
      payloadWriteMessage({
        data: {
          errors: [
            { message: "Reply Count is invalid" },
            { message: "Forbidden" },
          ],
        },
      }),
    ).toBe("Reply Count is invalid; Forbidden");
  });
});
