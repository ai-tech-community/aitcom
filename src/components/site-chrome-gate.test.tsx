import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ path: "/magazines/gazette/issue-1" }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.path }));
import { SiteChromeGate } from "./site-chrome-gate";

describe("SiteChromeGate", () => {
  it("restores site navigation when a reader leaves the issue", () => {
    const { rerender } = render(
      <SiteChromeGate>
        <nav>Site navigation</nav>
      </SiteChromeGate>,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
    state.path = "/magazines/gazette";
    rerender(
      <SiteChromeGate>
        <nav>Site navigation</nav>
      </SiteChromeGate>,
    );
    expect(screen.getByRole("navigation")).toHaveTextContent("Site navigation");
  });
});
