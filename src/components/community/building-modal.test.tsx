import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

beforeAll(() => {
  // jsdom lacks matchMedia, which BuildingModal's useIsMobile needs.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
});

import { BuildingModal } from "./building-modal";

describe("BuildingModal onMinimize", () => {
  it("calls onMinimize and keeps content mounted when provided", () => {
    const onMinimize = vi.fn();
    render(
      <BuildingModal isOpen onClose={vi.fn()} title="Design" onMinimize={onMinimize}>
        <div>room-body</div>
      </BuildingModal>,
    );
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(screen.getByText("room-body")).toBeInTheDocument(); // not internally minimized
  });

  it("falls back to internal minimize when onMinimize is absent", () => {
    render(
      <BuildingModal isOpen onClose={vi.fn()} title="Design">
        <div>room-body</div>
      </BuildingModal>,
    );
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(screen.queryByText("room-body")).not.toBeInTheDocument(); // content hidden
  });
});

describe("BuildingModal maximize", () => {
  it("offsets below the navbar instead of full inset-0 so the titlebar stays reachable", () => {
    const { container } = render(
      <BuildingModal isOpen onClose={vi.fn()} title="Design">
        <div>room-body</div>
      </BuildingModal>,
    );
    fireEvent.click(screen.getByTitle("Maximize"));
    const win = container.querySelector(".rounded-none") as HTMLElement;
    expect(win).toBeTruthy();
    expect(win.className).toContain("top-12"); // sits under the sticky z-50 navbar
    expect(win.className).not.toContain("inset-0"); // not the occluded full-screen variant
  });
});
