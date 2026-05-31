import { describe, expect, it } from "vitest";
import { canAdvise, nextIntroStatus } from "./advisory";

describe("canAdvise", () => {
  it("allows when autonomy is 'suggest'", () => {
    expect(canAdvise("suggest")).toBe(true);
  });
  it("blocks when 'off' or anything else", () => {
    expect(canAdvise("off")).toBe(false);
    expect(canAdvise("")).toBe(false);
  });
});

describe("nextIntroStatus", () => {
  it("stays pending until both accept", () => {
    expect(nextIntroStatus("pending", "pending")).toBe("pending_consent");
    expect(nextIntroStatus("accepted", "pending")).toBe("pending_consent");
  });
  it("connects only when both accept", () => {
    expect(nextIntroStatus("accepted", "accepted")).toBe("connected");
  });
  it("declines if either declines (even if the other accepted)", () => {
    expect(nextIntroStatus("declined", "pending")).toBe("declined");
    expect(nextIntroStatus("accepted", "declined")).toBe("declined");
  });
});
