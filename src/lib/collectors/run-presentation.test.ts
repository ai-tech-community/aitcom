import { describe, expect, it } from "vitest";
import { isRunActive, presentRun } from "./run-presentation";

describe("presentRun", () => {
  it.each([
    [
      { status: "queued", stopReason: null },
      { tone: "info", label: "queued", stop: null },
    ],
    [
      { status: "running", stopReason: null },
      { tone: "info", label: "running", stop: null },
    ],
    [
      { status: "succeeded", stopReason: "complete" },
      { tone: "success", label: "finished", stop: "complete" },
    ],
    [
      { status: "succeeded", stopReason: "page_limit" },
      { tone: "warning", label: "partial", stop: "page_limit" },
    ],
    [
      { status: "succeeded", stopReason: "item_limit" },
      { tone: "warning", label: "partial", stop: "item_limit" },
    ],
    [
      { status: "succeeded", stopReason: "time_limit" },
      { tone: "warning", label: "partial", stop: "time_limit" },
    ],
    [
      { status: "failed", stopReason: "robots_disallowed" },
      { tone: "destructive", label: "failed", stop: "robots_disallowed" },
    ],
    [
      { status: "failed", stopReason: null },
      { tone: "destructive", label: "failed", stop: null },
    ],
  ] as const)("%o → %o", (run, expected) => {
    expect(presentRun(run)).toEqual(expected);
  });

  it("knows which runs are still active", () => {
    expect(isRunActive("queued")).toBe(true);
    expect(isRunActive("running")).toBe(true);
    expect(isRunActive("succeeded")).toBe(false);
    expect(isRunActive("failed")).toBe(false);
  });
});
