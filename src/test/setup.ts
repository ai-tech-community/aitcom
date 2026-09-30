import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; Radix primitives (Checkbox, Select) measure
// with it. A no-op keeps them rendering; no test depends on real sizes.
const scope = globalThis as { ResizeObserver?: unknown };
if (typeof window !== "undefined" && !scope.ResizeObserver) {
  const noop = () => undefined;
  scope.ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
}
