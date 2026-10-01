import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DirectoryItem } from "./community-signals";

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  lastInput: null as unknown,
  isError: false,
  startCreate: vi.fn(),
  talkingIn: [] as string[],
  night: false,
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
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("./square-rooms", () => ({
  useSquareRooms: () => ({
    data: {
      talking: [],
      talkingCommunities: state.talkingIn,
      quiet: [],
    },
  }),
}));
vi.mock("./amsterdam-night", () => ({ useSquareNight: () => state.night }));
vi.mock("./join-action", () => ({
  JoinAction: (p: { slug: string; onPress?: () => void }) => (
    <button type="button" onClick={p.onPress}>
      join {p.slug}
    </button>
  ),
}));
vi.mock("@/components/communities/create-community-dialog", () => ({
  useStartCreateCommunity: () => state.startCreate,
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
// what the frame inked, so the test can read the street.
vi.mock("@/components/ascii/ascii-scene", () => ({
  AsciiScene: ({
    frame,
    onGridChange,
  }: {
    frame: (t: number, c: number, r: number) => Record<string, string[]>;
    onGridChange?: (g: { cols: number; rows: number }) => void;
  }) => {
    useEffect(() => onGridChange?.({ cols: 120, rows: 30 }), [onGridChange]);
    const f = frame(1, 120, 30);
    return (
      <>
        <pre data-testid="glow">{f.glow!.join("\n")}</pre>
        <pre data-testid="people">{f.people!.join("\n")}</pre>
      </>
    );
  },
}));

import { SquareHero } from "./square-hero";

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

const HEADLINE = <h1>Find your people</h1>;

afterEach(() => {
  state.isError = false;
  state.talkingIn = [];
  state.night = false;
  state.startCreate.mockReset();
});

describe("SquareHero", () => {
  it("carries the page headline", () => {
    state.items = [];
    render(<SquareHero headline={HEADLINE} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Find your people",
    );
  });

  it("asks for the most active communities, one per house", () => {
    state.items = [item("a", "Alpha")];
    render(<SquareHero headline={HEADLINE} />);
    expect(state.lastInput).toEqual({
      sort: "active",
      limit: 10,
      locale: "en",
    });
  });

  it("links each house and names the pointed-at one in the caption", () => {
    state.items = [
      item("a", "Alpha"),
      item("b", "Beta", { activeRecently: 3 }),
    ];
    render(<SquareHero headline={HEADLINE} />);
    expect(screen.getByTestId("street-house-b")).toHaveAttribute(
      "href",
      "/communities/b",
    );
    expect(screen.getByText(/legendWindows/)).toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByTestId("street-house-b"));
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText('activeRecently:{"count":3}')).toBeInTheDocument();
    expect(screen.getByTestId("glow").textContent).toContain("[ Beta ]");
  });

  it("turns the caption into a peek with Join and Visit that stays put", () => {
    state.items = [item("a", "Alpha"), item("b", "Beta")];
    const { container } = render(<SquareHero headline={HEADLINE} />);
    fireEvent.pointerEnter(screen.getByTestId("street-house-b"));
    expect(screen.getByRole("button", { name: "join b" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "visit" })).toHaveAttribute(
      "href",
      "/communities/b",
    );
    // Moving off the house onto the Join button keeps the peek…
    const join = screen.getByRole("button", { name: "join b" });
    fireEvent.pointerOut(screen.getByTestId("street-house-b"), {
      relatedTarget: join,
    });
    expect(screen.getByRole("button", { name: "join b" })).toBeInTheDocument();
    // …leaving the whole street area lets it go.
    fireEvent.pointerLeave(container.querySelector("section")!);
    expect(screen.queryByRole("button", { name: "join b" })).toBeNull();
    expect(screen.getByText(/legendWindows/)).toBeInTheDocument();
  });

  it("puts an empty lot at the end of the street that starts a community", () => {
    state.items = [item("a", "Alpha")];
    render(<SquareHero headline={HEADLINE} />);
    expect(screen.getByTestId("people").textContent).toContain("lotSign");
    fireEvent.click(screen.getByTestId("street-lot"));
    expect(state.startCreate).toHaveBeenCalledTimes(1);
  });

  it("still invites the first community on an empty or failed directory", () => {
    state.items = [];
    const { rerender } = render(<SquareHero headline={HEADLINE} />);
    expect(screen.getByTestId("street-lot")).toBeInTheDocument();
    expect(screen.queryByText(/legendWindows/)).toBeNull();
    state.isError = true;
    rerender(<SquareHero headline={HEADLINE} />);
    expect(screen.queryByTestId("street-house-a")).toBeNull();
    expect(screen.getByTestId("street-lot")).toBeInTheDocument();
  });

  it("moves the peek to another house only when the pointer rests there", () => {
    vi.useFakeTimers();
    try {
      state.items = [item("a", "Alpha"), item("b", "Beta")];
      render(<SquareHero headline={HEADLINE} />);
      fireEvent.pointerEnter(screen.getByTestId("street-house-b"));
      expect(
        screen.getByRole("button", { name: "join b" }),
      ).toBeInTheDocument();
      // Passing over another house on the way to the button changes nothing…
      fireEvent.pointerEnter(screen.getByTestId("street-house-a"));
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.pointerEnter(screen.getByTestId("street-lot"));
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(
        screen.getByRole("button", { name: "join b" }),
      ).toBeInTheDocument();
      // …resting on it does.
      fireEvent.pointerEnter(screen.getByTestId("street-house-a"));
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(
        screen.getByRole("button", { name: "join a" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the peek pinned after Join is pressed, e.g. under the sign-in dialog", () => {
    state.items = [item("a", "Alpha"), item("b", "Beta")];
    const { container } = render(<SquareHero headline={HEADLINE} />);
    fireEvent.pointerEnter(screen.getByTestId("street-house-b"));
    fireEvent.click(screen.getByRole("button", { name: "join b" }));
    fireEvent.pointerLeave(container.querySelector("section")!);
    expect(screen.getByRole("button", { name: "join b" })).toBeInTheDocument();
  });

  it("draws what the data says: talking rooms, new houses, the night", () => {
    state.items = [item("a", "Alpha", { isNew: true }), item("b", "Beta")];
    state.talkingIn = ["b"];
    state.night = true;
    render(<SquareHero headline={HEADLINE} />);
    expect(screen.getByTestId("people").textContent).toContain("--v--");
    expect(screen.getByTestId("glow").textContent).toMatch(/[+']/);
  });

  it("lists only the signs that are on the street, and says the peek's in words", () => {
    state.items = [item("a", "Alpha", { isNew: true }), item("b", "Beta")];
    state.talkingIn = ["b"];
    render(<SquareHero headline={HEADLINE} />);
    const legend = screen.getByText(/legendWindows/).textContent;
    expect(legend).toContain("legendBubble");
    expect(legend).toContain("legendScaffold");
    expect(legend).not.toContain("legendFlag");
    expect(legend).not.toContain("legendNight");
    fireEvent.pointerEnter(screen.getByTestId("street-house-b"));
    expect(screen.getByText("talkedToday")).toBeInTheDocument();
  });
});
