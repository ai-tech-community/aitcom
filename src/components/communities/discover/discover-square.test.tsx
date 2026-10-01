import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DirectoryItem } from "./community-signals";

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  lastInput: null as unknown,
  isError: false,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      directory: {
        useQuery: (input: unknown) => {
          state.lastInput = input;
          return {
            isLoading: false,
            isError: state.isError,
            data: state.isError ? undefined : { items: state.items },
            refetch: vi.fn(),
          };
        },
      },
    },
  },
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
// The real scene measures the DOM; this one reports a wide grid and prints
// what the frame inked at full strength, so the test can read the street.
vi.mock("@/components/ascii/ascii-scene", () => ({
  AsciiScene: ({
    frame,
    onGridChange,
  }: {
    frame: (t: number, c: number, r: number) => Record<string, string[]>;
    onGridChange?: (g: { cols: number; rows: number }) => void;
  }) => {
    useEffect(() => onGridChange?.({ cols: 100, rows: 20 }), [onGridChange]);
    return <pre data-testid="glow">{frame(1, 100, 20).glow!.join("\n")}</pre>;
  },
}));

import { DiscoverSquare } from "./discover-square";

function item(slug: string, name: string, over: Partial<DirectoryItem> = {}) {
  return {
    id: slug,
    slug,
    name,
    description: null,
    logoUrl: null,
    joinPolicy: "open",
    memberCount: 4,
    activeRecently: 0,
    isNew: false,
    openRooms: 0,
    nextEvent: null,
    faces: [],
    ...over,
  } satisfies DirectoryItem;
}

describe("DiscoverSquare", () => {
  it("asks for the most active communities, one per house", () => {
    state.isError = false;
    state.items = [item("a", "Alpha")];
    render(<DiscoverSquare />);
    expect(state.lastInput).toEqual({ sort: "active", limit: 6, locale: "en" });
  });

  it("links each house to its community", () => {
    state.isError = false;
    state.items = [item("a", "Alpha"), item("b", "Beta")];
    render(<DiscoverSquare />);
    expect(screen.getByTestId("street-house-b")).toHaveAttribute(
      "href",
      "/communities/b",
    );
    expect(screen.getByTestId("street-house-b")).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("names the pointed-at house and its live facts, then returns to the legend", () => {
    state.isError = false;
    state.items = [
      item("a", "Alpha"),
      item("b", "Beta", { activeRecently: 3 }),
    ];
    render(<DiscoverSquare />);
    expect(screen.getByText("squareHint")).toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByTestId("street-house-b"));
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText('activeRecently:{"count":3}')).toBeInTheDocument();
    expect(screen.getByTestId("glow").textContent).toContain("[ Beta ]");
    fireEvent.pointerLeave(screen.getByTestId("street-house-b").parentElement!);
    expect(screen.getByText("squareHint")).toBeInTheDocument();
  });

  it("does not draw a square without communities or on error", () => {
    state.isError = false;
    state.items = [];
    const { container, rerender } = render(<DiscoverSquare />);
    expect(container).toBeEmptyDOMElement();
    state.isError = true;
    rerender(<DiscoverSquare />);
    expect(container).toBeEmptyDOMElement();
  });
});
