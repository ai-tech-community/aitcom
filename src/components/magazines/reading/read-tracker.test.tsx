import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutate, useMutation } = vi.hoisted(() => ({
  mutate: vi.fn(),
  useMutation: vi.fn(),
}));
vi.mock("@/trpc/react", () => ({
  api: { magazineStats: { record: { useMutation } } },
}));

import { ReadTracker } from "./read-tracker";

let intersect: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  mutate.mockReset();
  useMutation.mockReset().mockImplementation(() => ({ mutate }));
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("ReadTracker", () => {
  it("sends one view on mount, including Strict Mode", () => {
    const { rerender, container } = render(
      <StrictMode>
        <ReadTracker issueId={7} enabled trackEnd={false} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <ReadTracker issueId={7} enabled trackEnd={false} />
      </StrictMode>,
    );
    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      { issueId: 7, event: "view" },
      { onError: expect.any(Function) },
    );
    expect(container).toBeEmptyDOMElement();
    expect(observe).not.toHaveBeenCalled();
  });

  it("sends read_end once when the silent sentinel intersects", () => {
    const { container, unmount } = render(
      <StrictMode>
        <ReadTracker issueId={7} articleId={11} enabled trackEnd />
      </StrictMode>,
    );
    const sentinel = container.querySelector('[aria-hidden="true"]')!;
    expect(sentinel).toBeEmptyDOMElement();
    expect(observe).toHaveBeenCalledWith(sentinel);
    const emit = (isIntersecting: boolean) =>
      act(() =>
        intersect(
          [{ isIntersecting, target: sentinel } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      );
    emit(false);
    expect(mutate).toHaveBeenCalledTimes(1);
    emit(true);
    emit(true);
    expect(mutate.mock.calls).toEqual([
      [
        { issueId: 7, articleId: 11, event: "view" },
        { onError: expect.any(Function) },
      ],
      [
        { issueId: 7, articleId: 11, event: "read_end" },
        { onError: expect.any(Function) },
      ],
    ]);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("sends nothing when disabled", () => {
    const { container } = render(
      <ReadTracker issueId={7} articleId={11} enabled={false} trackEnd />,
    );
    expect(mutate).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps observing when the mutation result object changes", () => {
    const firstResult = { mutate, isPending: false };
    const nextResult = { mutate, isPending: true };
    useMutation.mockReturnValue(firstResult);
    const { rerender } = render(
      <ReadTracker issueId={7} articleId={11} enabled trackEnd />,
    );
    useMutation.mockReturnValue(nextResult);
    rerender(<ReadTracker issueId={7} articleId={11} enabled trackEnd />);
    expect(useMutation).toHaveBeenCalledTimes(2);
    expect(useMutation.mock.results[0]?.value).toBe(firstResult);
    expect(useMutation.mock.results[1]?.value).toBe(nextResult);
    expect(firstResult).not.toBe(nextResult);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    act(() =>
      intersect(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(mutate).toHaveBeenLastCalledWith(
      { issueId: 7, articleId: 11, event: "read_end" },
      { onError: expect.any(Function) },
    );
  });

  it("ignores mutation failures without throwing or showing UI", () => {
    mutate.mockImplementation(
      (_input: unknown, options: { onError: (error: Error) => void }) => {
        options.onError(new Error("offline"));
      },
    );
    const { container } = render(
      <ReadTracker issueId={7} articleId={11} enabled trackEnd />,
    );
    expect(() =>
      act(() =>
        intersect(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      ),
    ).not.toThrow();
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("");
  });

  it("still sends a view without an observer", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(
      <ReadTracker issueId={7} articleId={11} enabled trackEnd />,
    );
    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      { issueId: 7, articleId: 11, event: "view" },
      { onError: expect.any(Function) },
    );
    expect(observe).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
