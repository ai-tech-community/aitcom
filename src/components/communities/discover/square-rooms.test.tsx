import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  rooms: [] as unknown[],
  quiet: [] as unknown[],
  quietTotal: 0,
  signedIn: true,
  openSpace: vi.fn(),
  promptAuth: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      squareRooms: {
        useQuery: () => ({
          data: {
            talking: state.rooms,
            quiet: state.quiet,
            quietTotal: state.quietTotal,
          },
        }),
      },
    },
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
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

import { SquareRooms } from "./square-rooms";

const ROOM = {
  spaceId: "s1",
  spaceSlug: "agent-builders",
  spaceName: "agent-builders",
  purpose: null,
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
  purpose: null,
  communitySlug: "ait",
  communityName: "AIT Netherlands",
  members: 4,
};

afterEach(() => {
  state.quiet = [];
  state.quietTotal = 0;
  state.openSpace.mockReset();
  state.promptAuth.mockReset();
  state.signedIn = true;
});

describe("SquareRooms", () => {
  it("is not there when no listed community has a public room", () => {
    state.rooms = [];
    const { container } = render(<SquareRooms layout="strip" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows each room with its community and who is talking", () => {
    state.rooms = [ROOM];
    render(<SquareRooms layout="strip" />);
    expect(screen.getByText("#agent-builders")).toBeInTheDocument();
    expect(
      screen.getByText('peopleTalking:{"count":3} · agentsTalking:{"count":1}'),
    ).toBeInTheDocument();
  });

  it("leaves out a zero count", () => {
    state.rooms = [{ ...ROOM, agents: 0 }];
    render(<SquareRooms layout="strip" />);
    expect(screen.getByText('peopleTalking:{"count":3}')).toBeInTheDocument();
  });

  it("opens the room's chat window for a member", () => {
    state.rooms = [ROOM];
    render(<SquareRooms layout="strip" />);
    fireEvent.click(screen.getByRole("button"));
    expect(state.openSpace).toHaveBeenCalledWith({
      communitySlug: "mlops",
      spaceSlug: "agent-builders",
      spaceName: "agent-builders",
      communityName: "MLOps Amsterdam",
    });
  });

  it("asks a guest to sign in first", () => {
    state.rooms = [ROOM];
    state.signedIn = false;
    render(<SquareRooms layout="strip" />);
    fireEvent.click(screen.getByRole("button"));
    expect(state.openSpace).not.toHaveBeenCalled();
    expect(state.promptAuth).toHaveBeenCalledWith(
      'signInToOpenSpace:{"space":"agent-builders"}',
    );
  });

  it("offers quiet rooms with a hello when nobody is talking", () => {
    state.rooms = [];
    state.quiet = [QUIET];
    state.quietTotal = 1;
    render(<SquareRooms layout="strip" />);
    expect(screen.getByText("openRoomsTitle")).toBeInTheDocument();
    expect(screen.getByText("sayHi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(state.openSpace).toHaveBeenCalledWith(
      expect.objectContaining({ spaceSlug: "lobby", communitySlug: "ait" }),
    );
  });

  it("splits the panel into talking and open rooms, with the rest counted", () => {
    state.rooms = [ROOM];
    state.quiet = [QUIET];
    state.quietTotal = 3;
    render(<SquareRooms layout="panel" />);
    expect(
      screen.getByRole("complementary", { name: "roomsPanelLabel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("talkingNow")).toBeInTheDocument();
    expect(screen.getByText("openRoomsTitle")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText('moreRooms:{"count":2}')).toBeInTheDocument();
  });
});
