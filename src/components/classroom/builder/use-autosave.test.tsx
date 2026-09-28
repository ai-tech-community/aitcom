import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave, useUnsavedChangesGuard } from "./use-autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(
  save: (v: string) => Promise<void>,
  initial = "a",
  enabled = true,
) {
  return renderHook(
    ({ value }) => useAutosave({ value, save, delayMs: 1000, enabled }),
    {
      initialProps: { value: initial },
    },
  );
}

describe("useAutosave", () => {
  it("does not save the initial value", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(save);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("debounces and saves the latest value once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "ab" });
    await act(() => vi.advanceTimersByTimeAsync(500));
    rerender({ value: "abc" });
    expect(result.current.status).toBe("dirty");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc");
    expect(result.current.status).toBe("saved");
    expect(result.current.savedAt).toBeInstanceOf(Date);
  });

  it("keeps the value and reports error on failure; retry saves it", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("NETWORK"))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("error");
    await act(() => result.current.retry());
    expect(save).toHaveBeenLastCalledWith("b");
    expect(result.current.status).toBe("saved");
  });

  it("reports conflict for COURSE_CHANGED / LESSON_CHANGED and does not retry automatically", async () => {
    const save = vi.fn().mockRejectedValue(new Error("LESSON_CHANGED"));
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("conflict");
    rerender({ value: "bc" });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never overlaps saves; a change during a save triggers one follow-up with the latest value", async () => {
    let resolveFirst!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValue(undefined);
    const { rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ value: "bc" });
    rerender({ value: "bcd" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst();
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bcd");
  });

  it("undo to the pre-save value during an in-flight save still saves the undone value", async () => {
    let resolveFirst!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ value: "a" });
    await act(async () => {
      resolveFirst();
    });
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls).toEqual([["b"], ["a"]]);
    expect(result.current.status).toBe("saved");
  });

  it("a change during a save that ends before the debounce is saved by the pending timer", async () => {
    let resolveFirst!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ value: "bc" });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => {
      resolveFirst();
    });
    // Save of "b" finished; "bc" is still waiting for its debounce.
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("dirty");
    await act(() => vi.advanceTimersByTimeAsync(699));
    expect(save).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bc");
    expect(result.current.status).toBe("saved");
  });

  it("flush saves a pending value immediately", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => result.current.flush());
    expect(save).toHaveBeenCalledWith("b");
  });

  it("flush resolves with the settled status, before React re-renders", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("NETWORK"))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    let settled: string | undefined;
    await act(async () => {
      settled = await result.current.flush();
    });
    expect(settled).toBe("error");
    await act(async () => {
      settled = await result.current.flush();
    });
    expect(settled).toBe("saved");
  });

  it("flush reports a conflict", async () => {
    const save = vi.fn().mockRejectedValue(new Error("COURSE_CHANGED"));
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    let settled: string | undefined;
    await act(async () => {
      settled = await result.current.flush();
    });
    expect(settled).toBe("conflict");
  });

  it("flushes a pending value on unmount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = setup(save);
    rerender({ value: "b" });
    unmount();
    expect(save).toHaveBeenCalledWith("b");
  });

  it("never saves when disabled", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = setup(save, "a", false);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
  });

  // --- Additional contract cases beyond the brief ---

  it("reports conflict for COURSE_CHANGED too", async () => {
    const save = vi.fn().mockRejectedValue(new Error("COURSE_CHANGED"));
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("conflict");
  });

  it("starts the debounce when enabled flips to true with an already-changed value", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value, enabled }) =>
        useAutosave({ value, save, delayMs: 1000, enabled }),
      { initialProps: { value: "a", enabled: false } },
    );
    rerender({ value: "b", enabled: false });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
    rerender({ value: "b", enabled: true });
    expect(result.current.status).toBe("dirty");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
    expect(result.current.status).toBe("saved");
  });

  it("does not flush on unmount when disabled", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = setup(save, "a", false);
    rerender({ value: "b" });
    unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not save again on unmount when the value is already saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("unmount during an in-flight save queues the latest value after it, never in parallel", async () => {
    let resolveFirst!: () => void;
    let inFlight = 0;
    let maxInFlight = 0;
    const save = vi.fn(async (v: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (v === "b")
        await new Promise<void>((r) => {
          resolveFirst = r;
        });
      inFlight--;
    });
    const { rerender, unmount } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ value: "bc" });
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bc");
    expect(maxInFlight).toBe(1);
  });

  it("a new change after an error is saved again after the debounce", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("NETWORK"))
      .mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("error");
    rerender({ value: "bc" });
    expect(result.current.status).toBe("dirty");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bc");
    expect(result.current.status).toBe("saved");
  });

  it("goes back to idle when the author undoes a change before it saves", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    expect(result.current.status).toBe("dirty");
    rerender({ value: "a" });
    expect(result.current.status).toBe("idle");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
  });

  it("retry does nothing while in conflict (the server would reject it again)", async () => {
    const save = vi.fn().mockRejectedValue(new Error("COURSE_CHANGED"));
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await act(() => result.current.retry());
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("conflict");
  });

  describe("under React StrictMode", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    function setupStrict(save: (v: string) => Promise<void>) {
      return renderHook(
        ({ value }) => useAutosave({ value, save, delayMs: 1000 }),
        {
          initialProps: { value: "a" },
          wrapper,
        },
      );
    }

    it("does not save on the strict-mode fake unmount/remount or on real unmount when nothing changed", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const { result, unmount } = setupStrict(save);
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(result.current.status).toBe("idle");
      unmount();
      expect(save).not.toHaveBeenCalled();
    });

    it("saves a debounced change exactly once", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = setupStrict(save);
      rerender({ value: "b" });
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith("b");
      expect(result.current.status).toBe("saved");
    });

    it("flushes a dirty value exactly once on unmount", () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const { rerender, unmount } = setupStrict(save);
      rerender({ value: "b" });
      unmount();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith("b");
    });
  });
});

describe("useUnsavedChangesGuard", () => {
  it("prevents unload only while active", () => {
    const { rerender } = renderHook(
      ({ active }) => useUnsavedChangesGuard(active),
      { initialProps: { active: true } },
    );
    const e1 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    rerender({ active: false });
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});
