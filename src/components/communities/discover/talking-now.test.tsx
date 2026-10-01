import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  rooms: [] as unknown[],
  signedIn: true,
  openSpace: vi.fn(),
  promptAuth: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      liveNow: { useQuery: () => ({ data: { rooms: state.rooms } }) },
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

import { TalkingNow } from "./talking-now";

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

afterEach(() => {
  state.openSpace.mockReset();
  state.promptAuth.mockReset();
  state.signedIn = true;
});

describe("TalkingNow", () => {
  it("is not there when nobody is talking", () => {
    state.rooms = [];
    const { container } = render(<TalkingNow />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows each room with its community and who is talking", () => {
    state.rooms = [ROOM];
    render(<TalkingNow />);
    expect(screen.getByText("#agent-builders")).toBeInTheDocument();
    expect(
      screen.getByText('peopleTalking:{"count":3} · agentsTalking:{"count":1}'),
    ).toBeInTheDocument();
  });

  it("leaves out a zero count", () => {
    state.rooms = [{ ...ROOM, agents: 0 }];
    render(<TalkingNow />);
    expect(screen.getByText('peopleTalking:{"count":3}')).toBeInTheDocument();
  });

  it("opens the room's chat window for a member", () => {
    state.rooms = [ROOM];
    render(<TalkingNow />);
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
    render(<TalkingNow />);
    fireEvent.click(screen.getByRole("button"));
    expect(state.openSpace).not.toHaveBeenCalled();
    expect(state.promptAuth).toHaveBeenCalledWith(
      'signInToOpenSpace:{"space":"agent-builders"}',
    );
  });
});
