import { describe, it, expect } from "vitest";
import { cellHeatState } from "./cell-state";

describe("cellHeatState", () => {
  it("maps a pending cell to 'pending'", () => {
    expect(cellHeatState("pending", null)).toBe("pending");
  });
  it("maps requeued to 'pending' (back in the queue)", () => {
    expect(cellHeatState("requeued", null)).toBe("pending");
  });
  it("maps claimed to 'claimed'", () => {
    expect(cellHeatState("claimed", null)).toBe("claimed");
  });
  it("maps completed with a pending result to 'completed'", () => {
    expect(cellHeatState("completed", "pending")).toBe("completed");
  });
  it("maps completed with a verified result to 'verified'", () => {
    expect(cellHeatState("completed", "verified")).toBe("verified");
  });
  it("maps failed to 'failed'", () => {
    expect(cellHeatState("failed", null)).toBe("failed");
  });
  it("maps completed with a null outcome to 'completed' (not yet verified)", () => {
    expect(cellHeatState("completed", null)).toBe("completed");
  });
  it("maps completed with a failed outcome to 'completed'", () => {
    expect(cellHeatState("completed", "failed")).toBe("completed");
  });
});
