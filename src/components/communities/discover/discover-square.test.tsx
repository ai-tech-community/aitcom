import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DirectoryItem } from "./community-signals";

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  lastInput: null as unknown,
  push: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      directory: {
        useQuery: (input: unknown) => {
          state.lastInput = input;
          return {
            isLoading: false,
            isError: false,
            data: { items: state.items },
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
  useRouter: () => ({ push: state.push }),
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/communities/create-community-dialog", () => ({
  CreateCommunityButton: () => <button type="button">create</button>,
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

function item(slug: string, name: string): DirectoryItem {
  return {
    id: slug,
    slug,
    name,
    description: null,
    logoUrl: null,
    joinPolicy: "open",
    createdAt: new Date("2025-01-01"),
    memberCount: 4,
    activeRecently: 0,
    newJoins: 0,
    score: 0,
    isNew: false,
    nextEvent: null,
    places: [],
    faces: [],
  };
}

afterEach(() => state.push.mockReset());

describe("DiscoverSquare", () => {
  it("asks for the most active communities, one per house", () => {
    state.items = [item("a", "Alpha")];
    render(<DiscoverSquare />);
    expect(state.lastInput).toEqual({ sort: "active", limit: 6, locale: "en" });
  });

  it("lists every community as a link", () => {
    state.items = [item("a", "Alpha"), item("b", "Beta")];
    render(<DiscoverSquare />);
    expect(screen.getByRole("link", { name: /Alpha/ })).toHaveAttribute(
      "href",
      "/communities/a",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks the row when the pointer is on its house, and opens it on click", () => {
    state.items = [item("a", "Alpha"), item("b", "Beta")];
    render(<DiscoverSquare />);
    const house = screen.getByTestId("street-house-b");
    fireEvent.pointerEnter(house);
    expect(screen.getByRole("link", { name: /Beta/ })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: /Alpha/ })).not.toHaveAttribute(
      "data-active",
    );
    fireEvent.click(house);
    expect(state.push).toHaveBeenCalledWith("/communities/b");
  });

  it("inks the house of the row being pointed at or focused", () => {
    state.items = [item("a", "Alpha"), item("b", "Beta")];
    render(<DiscoverSquare />);
    expect(screen.getByTestId("glow").textContent).not.toContain("Alpha");
    fireEvent.focus(screen.getByRole("link", { name: /Alpha/ }));
    expect(screen.getByTestId("glow").textContent).toContain("Alpha");
    fireEvent.blur(screen.getByRole("link", { name: /Alpha/ }));
    expect(screen.getByTestId("glow").textContent).not.toContain("Alpha");
  });

  it("invites the first organizer when the square is empty", () => {
    state.items = [];
    render(<DiscoverSquare />);
    expect(screen.getByText("squareEmptyTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();
  });
});
