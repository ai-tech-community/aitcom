import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const ui = vi.hoisted(() => ({
  redesigned: false,
  openSpace: vi.fn(),
  join: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => ui.redesigned,
}));
vi.mock("@/components/communities/explore/space-window-provider", () => ({
  useSpaceWindows: () => ({ openSpace: ui.openSpace, closeSpace: vi.fn() }),
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "viewer" } } }) },
}));
vi.mock("@/components/inbox/use-inbox-stream", () => ({
  useInboxStream: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ACTIVE_ROOM = {
  id: "s1",
  name: "Design",
  purpose: null,
  visibility: "public",
  membership: "active" as string | null,
  conversationId: "c1" as string | null,
  memberCount: 0,
  memberAvatars: [],
  viewerIsAdmin: false,
};

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      spaces: { getRoom: { invalidate: vi.fn() } },
      communities: { getBySlug: { getData: () => ({ name: "Community" }) } },
    }),
    spaces: {
      getRoom: {
        useQuery: vi.fn(() => ({
          data: ACTIVE_ROOM,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        })),
      },
      joinRoom: {
        useMutation: vi.fn(() => ({ mutate: ui.join, isPending: false })),
      },
      requestAccess: {
        useMutation: vi.fn(() => ({ mutate: ui.request, isPending: false })),
      },
    },
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/messages/conversation-view", () => ({
  ConversationView: ({ redesigned }: { redesigned: boolean }) => (
    <div data-testid="cv" data-room-presentation={redesigned} />
  ),
}));
vi.mock("./room-members-panel", () => ({ RoomMembersPanel: () => <div /> }));

import { RoomView } from "./room-view";

describe("RoomView fillHeight", () => {
  it("uses h-full when fillHeight is set", () => {
    const { container } = render(
      <RoomView slug="acme" spaceSlug="design" fillHeight />,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "h-full",
    );
  });

  it("uses the page calc height by default", () => {
    const { container } = render(<RoomView slug="acme" spaceSlug="design" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "min-h-96",
    );
  });
});

it("uses the redesigned transcript on both the page and in a parallel window", () => {
  ui.redesigned = true;
  try {
    const { rerender } = render(<RoomView slug="acme" spaceSlug="design" />);
    expect(screen.getByTestId("cv")).toHaveAttribute(
      "data-room-presentation",
      "true",
    );
    rerender(<RoomView slug="acme" spaceSlug="design" fillHeight />);
    expect(screen.getByTestId("cv")).toHaveAttribute(
      "data-room-presentation",
      "true",
    );
  } finally {
    ui.redesigned = false;
  }
});

it.each([
  ["public", null, "join.label", ui.join],
  ["private", null, "requestAccess.label", ui.request],
  ["private", "pending_request", null, ui.request],
] as const)(
  "keeps the %s lobby action for membership %s",
  (visibility, membership, button, mutation) => {
    ui.redesigned = true;
    const saved = { ...ACTIVE_ROOM };
    Object.assign(ACTIVE_ROOM, {
      visibility,
      membership,
      conversationId: null,
    });
    mutation.mockClear();
    try {
      render(<RoomView slug="acme" spaceSlug="design" />);
      expect(screen.queryByTestId("cv")).not.toBeInTheDocument();
      if (button) {
        fireEvent.click(screen.getByRole("button", { name: button }));
        expect(mutation).toHaveBeenCalledWith({ slug: "acme", spaceId: "s1" });
      } else {
        expect(screen.getByRole("status")).toHaveTextContent("pending");
        expect(mutation).not.toHaveBeenCalled();
      }
    } finally {
      Object.assign(ACTIVE_ROOM, saved);
      ui.redesigned = false;
    }
  },
);

it("opens an existing room in the parallel window provider", () => {
  ui.redesigned = true;
  try {
    render(<RoomView slug="acme" spaceSlug="design" />);
    fireEvent.click(screen.getByRole("button", { name: "openInWindow" }));
    expect(ui.openSpace).toHaveBeenCalledWith({
      communitySlug: "acme",
      spaceSlug: "design",
      communityName: "Community",
      spaceName: "Design",
    });
  } finally {
    ui.redesigned = false;
  }
});
