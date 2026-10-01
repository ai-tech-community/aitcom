import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  talking: [] as unknown[],
  quiet: [] as unknown[],
  signedIn: true,
  openSpace: vi.fn(),
  promptAuth: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      squareRooms: {
        useQuery: () => ({
          data: { talking: state.talking, quiet: state.quiet },
        }),
      },
    },
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
  useFormatter: () => ({ relativeTime: () => "2 hours ago" }),
  useNow: () => new Date("2026-10-01T12:00:00Z"),
}));
vi.mock("@/components/communities/explore/space-window-provider", () => ({
  useSpaceWindows: () => ({ openSpace: state.openSpace }),
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void, intent?: string) => {
      if (state.signedIn) action();
      else state.promptAuth(intent);
    },
  }),
}));

import { RoomsPanel, RoomsStrip, STRIP_ROOMS } from "./square-rooms";

const TALKING = {
  spaceId: "s1",
  spaceSlug: "agent-builders",
  spaceName: "agent-builders",
  communitySlug: "mlops",
  communityName: "MLOps Amsterdam",
  people: 3,
  agents: 1,
  lastMessageAt: "2026-10-01T10:00:00.000Z",
};

const QUIET = {
  spaceId: "q1",
  spaceSlug: "lobby",
  spaceName: "lobby",
  purpose: "Say who you are",
  communitySlug: "ait",
  communityName: "AIT Netherlands",
  members: 4,
};

afterEach(() => {
  state.talking = [];
  state.quiet = [];
  state.signedIn = true;
  state.openSpace.mockReset();
  state.promptAuth.mockReset();
});

describe("RoomsPanel", () => {
  it("is not there when no listed community has a public room", () => {
    const { container } = render(<RoomsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists talking rooms with who and when, then open rooms", () => {
    state.talking = [TALKING];
    state.quiet = [QUIET];
    render(<RoomsPanel />);
    expect(
      screen.getByRole("complementary", { name: "roomsPanelLabel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("talkingNow")).toBeInTheDocument();
    expect(
      screen.getByText('peopleTalking:{"count":3} · agentsTalking:{"count":1}'),
    ).toBeInTheDocument();
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
    expect(screen.getByText("openRoomsTitle")).toBeInTheDocument();
    expect(screen.getByText("Say who you are")).toBeInTheDocument();
    expect(
      screen.getByText('roomMembers:{"count":4} · sayHi'),
    ).toBeInTheDocument();
  });

  it("leaves out a zero count", () => {
    state.talking = [{ ...TALKING, agents: 0 }];
    render(<RoomsPanel />);
    expect(screen.getByText('peopleTalking:{"count":3}')).toBeInTheDocument();
  });

  it("opens a room's chat window for a member", () => {
    state.quiet = [QUIET];
    render(<RoomsPanel />);
    fireEvent.click(screen.getByRole("button"));
    expect(state.openSpace).toHaveBeenCalledWith({
      communitySlug: "ait",
      spaceSlug: "lobby",
      spaceName: "lobby",
      communityName: "AIT Netherlands",
    });
  });

  it("asks a guest to sign in first", () => {
    state.talking = [TALKING];
    state.signedIn = false;
    render(<RoomsPanel />);
    fireEvent.click(screen.getByRole("button"));
    expect(state.openSpace).not.toHaveBeenCalled();
    expect(state.promptAuth).toHaveBeenCalledWith(
      'signInToOpenSpace:{"space":"agent-builders"}',
    );
  });
});

describe("RoomsStrip", () => {
  it("shows one part only, under its own heading", () => {
    state.talking = [TALKING];
    state.quiet = [QUIET];
    render(<RoomsStrip part="talking" />);
    expect(screen.getByText("talkingNow")).toBeInTheDocument();
    expect(screen.queryByText("openRoomsTitle")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("caps each part so the directory stays near the top", () => {
    state.quiet = Array.from({ length: 8 }, (_, i) => ({
      ...QUIET,
      spaceId: `q${i}`,
    }));
    render(<RoomsStrip part="open" />);
    expect(screen.getAllByRole("button")).toHaveLength(STRIP_ROOMS);
  });

  it("renders nothing for an empty part", () => {
    state.quiet = [QUIET];
    const { container } = render(<RoomsStrip part="talking" />);
    expect(container).toBeEmptyDOMElement();
  });
});
