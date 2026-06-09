import { describe, it, expect, vi, beforeEach } from "vitest";

const confettiMock = vi.fn();
vi.mock("canvas-confetti", () => ({
  default: (...args: unknown[]) => {
    confettiMock(...args);
  },
}));

import { fireConfetti } from "./celebrate";

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("fireConfetti", () => {
  beforeEach(() => confettiMock.mockClear());

  it("fires a burst when motion is allowed", () => {
    setReducedMotion(false);
    fireConfetti();
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it("no-ops under prefers-reduced-motion", () => {
    setReducedMotion(true);
    fireConfetti();
    expect(confettiMock).not.toHaveBeenCalled();
  });
});
