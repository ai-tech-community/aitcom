import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Progress, clampProgressValue } from "./progress";

describe("clampProgressValue", () => {
  it("clamps into 0..100 and treats non-finite as indeterminate", () => {
    expect(clampProgressValue(42)).toBe(42);
    expect(clampProgressValue(140)).toBe(100);
    expect(clampProgressValue(-5)).toBe(0);
    expect(clampProgressValue(Number.NaN)).toBeNull();
    expect(clampProgressValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampProgressValue(undefined)).toBeNull();
  });
});

describe("Progress", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exposes the value to assistive tech", () => {
    render(<Progress value={30} aria-label="Upload" />);
    expect(screen.getByRole("progressbar", { name: "Upload" })).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
  });

  it("clamps an overflowing value instead of letting Radix reject it", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(<Progress value={180} aria-label="Context" />);
    const bar = screen.getByRole("progressbar", { name: "Context" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.querySelector('[data-slot="progress-indicator"]')).toHaveStyle({
      transform: "translateX(-0%)",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("renders an indeterminate bar for NaN without errors", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(<Progress value={Number.NaN} aria-label="Unknown" />);
    expect(
      screen.getByRole("progressbar", { name: "Unknown" }),
    ).not.toHaveAttribute("aria-valuenow");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
