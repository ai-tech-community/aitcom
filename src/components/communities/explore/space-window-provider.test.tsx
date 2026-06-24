import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { SpaceWindowProvider, useSpaceWindows } from "./space-window-provider";

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: w });
}
const ref = (slug: string) => ({
  communitySlug: "acme", spaceSlug: slug, spaceName: slug, communityName: "ACME",
});
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SpaceWindowProvider>{children}</SpaceWindowProvider>
);

beforeEach(() => {
  pushMock.mockReset();
  setWidth(1280); // desktop
});

describe("useSpaceWindows", () => {
  it("opens, dedupes, and caps to 3 on desktop (oldest minimized)", () => {
    const { result } = renderHook(() => useSpaceWindows(), { wrapper });
    act(() => result.current.openSpace(ref("a")));
    act(() => result.current.openSpace(ref("a"))); // dedupe
    expect(result.current.open).toHaveLength(1);
    act(() => result.current.openSpace(ref("b")));
    act(() => result.current.openSpace(ref("c")));
    act(() => result.current.openSpace(ref("d")));
    expect(result.current.open.map((w) => w.spaceSlug)).toEqual(["b", "c", "d"]);
    expect(result.current.minimized.map((w) => w.spaceSlug)).toEqual(["a"]);
  });

  it("minimizes and restores", () => {
    const { result } = renderHook(() => useSpaceWindows(), { wrapper });
    act(() => result.current.openSpace(ref("a")));
    act(() => result.current.minimizeSpace("acme/a"));
    expect(result.current.open).toHaveLength(0);
    expect(result.current.minimized).toHaveLength(1);
    act(() => result.current.restoreSpace("acme/a"));
    expect(result.current.open).toHaveLength(1);
  });

  it("navigates instead of opening a window on mobile", () => {
    setWidth(500);
    const { result } = renderHook(() => useSpaceWindows(), { wrapper });
    act(() => result.current.openSpace(ref("a")));
    expect(result.current.open).toHaveLength(0);
    expect(pushMock).toHaveBeenCalledWith("/communities/acme/spaces/a");
  });
});
