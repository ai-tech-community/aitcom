import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { useAsciiMotion, type AsciiMotionHandle } from "./use-ascii-motion";

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

describe("useAsciiMotion — re-measuring", () => {
  function stubResizeObserver() {
    const observed: Element[] = [];
    let callback: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    return { observed, fire: () => callback?.() };
  }

  function WithCopy({
    measure,
    onHandle,
  }: {
    measure: () => { cols: number };
    onHandle?: (h: AsciiMotionHandle) => void;
  }) {
    const scene = useRef<HTMLDivElement>(null);
    const copy = useRef<HTMLParagraphElement>(null);
    const handle = useAsciiMotion(scene, {
      frameMs: 100,
      observe: [copy],
      measure,
      draw: vi.fn(),
    });
    useEffect(() => {
      onHandle?.(handle);
    });
    return (
      <div ref={scene} data-testid="scene">
        <p ref={copy} data-testid="copy" />
      </div>
    );
  }

  it("also observes the extra elements and re-measures when they resize", () => {
    stubReducedMotion(true);
    const ro = stubResizeObserver();
    const measure = vi.fn(() => ({ cols: 1 }));
    const view = render(<WithCopy measure={measure} />);
    expect(ro.observed).toContain(view.getByTestId("scene"));
    expect(ro.observed).toContain(view.getByTestId("copy"));
    const before = measure.mock.calls.length;
    act(() => ro.fire());
    expect(measure.mock.calls.length).toBe(before + 1);
  });

  it("remeasure() rebuilds the measurement on demand", () => {
    stubReducedMotion(true);
    stubResizeObserver();
    const measure = vi.fn(() => ({ cols: 1 }));
    let handle: AsciiMotionHandle | null = null;
    render(
      <WithCopy
        measure={measure}
        onHandle={(h) => {
          handle = h;
        }}
      />,
    );
    const before = measure.mock.calls.length;
    act(() => handle!.remeasure());
    expect(measure.mock.calls.length).toBe(before + 1);
  });
});
