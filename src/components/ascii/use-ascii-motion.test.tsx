import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { useAsciiMotion } from "./use-ascii-motion";

type Listener = (event: MediaQueryListEvent) => void;

function stubReducedMotion(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    set(matches: boolean) {
      mql.matches = matches;
      for (const l of listeners) l({ matches } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function Scene({ draw }: { draw: (tick: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useAsciiMotion(ref, {
    frameMs: 100,
    staticTick: 7,
    measure: () => ({ cols: 10, rows: 4 }),
    draw: (tick) => draw(tick),
  });
  return <div ref={ref} />;
}

let raf: ReturnType<typeof vi.fn>;

beforeEach(() => {
  raf = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAsciiMotion", () => {
  it("draws one static frame and schedules nothing under reduced motion", () => {
    stubReducedMotion(true);
    const draw = vi.fn();
    render(<Scene draw={draw} />);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledWith(7);
    expect(raf).not.toHaveBeenCalled();
  });

  it("starts animating when the reduced-motion preference is turned off", () => {
    const pref = stubReducedMotion(true);
    render(<Scene draw={vi.fn()} />);
    expect(raf).not.toHaveBeenCalled();
    act(() => pref.set(false));
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it("stops scheduling frames while the tab is hidden", () => {
    stubReducedMotion(false);
    render(<Scene draw={vi.fn()} />);
    expect(raf).toHaveBeenCalledTimes(1);
    const cancel = vi.mocked(window.cancelAnimationFrame);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(cancel).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it("removes its listeners on unmount", () => {
    const pref = stubReducedMotion(false);
    const { unmount } = render(<Scene draw={vi.fn()} />);
    expect(pref.listenerCount).toBe(1);
    unmount();
    expect(pref.listenerCount).toBe(0);
  });
});
