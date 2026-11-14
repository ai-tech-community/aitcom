import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useCommunityIdentityDensity } from "./use-community-identity-density";

function setup(segments: string[], isMember: boolean) {
  return renderHook(
    (props: { segments: string[]; isMember: boolean }) =>
      useCommunityIdentityDensity(props.segments, props.isMember),
    { initialProps: { segments, isMember } },
  );
}

describe("useCommunityIdentityDensity", () => {
  it("is compact for a member on a tab page", () => {
    const { result } = setup(["insights"], true);
    expect(result.current).toBe("compact");
  });

  it("stays full when a visitor joins on a tab page, so the control they pressed stays", () => {
    const { result, rerender } = setup(["events"], false);
    expect(result.current).toBe("full");
    rerender({ segments: ["events"], isMember: true });
    expect(result.current).toBe("full");
  });

  it("turns compact once the new member moves to another page", () => {
    const { result, rerender } = setup(["events"], false);
    rerender({ segments: ["events"], isMember: true });
    rerender({ segments: ["forum"], isMember: true });
    expect(result.current).toBe("compact");
  });

  it("treats a new array with the same segments as the same page", () => {
    const { result, rerender } = setup(["events", "x"], false);
    rerender({ segments: ["events", "x"], isMember: true });
    expect(result.current).toBe("full");
  });

  it("turns full at once when a member leaves", () => {
    const { result, rerender } = setup(["forum"], true);
    rerender({ segments: ["forum"], isMember: false });
    expect(result.current).toBe("full");
  });
});
