import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const ACTIVE_ROOM = {
  id: "s1", name: "Design", purpose: null, visibility: "public",
  membership: "active", conversationId: "c1", memberCount: 0,
  memberAvatars: [], viewerIsAdmin: false,
};

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ spaces: { getRoom: { invalidate: vi.fn() } } }),
    spaces: {
      getRoom: { useQuery: vi.fn(() => ({ data: ACTIVE_ROOM, isLoading: false, isError: false, refetch: vi.fn() })) },
      joinRoom: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      requestAccess: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/messages/conversation-view", () => ({ ConversationView: () => <div data-testid="cv" /> }));
vi.mock("./room-members-panel", () => ({ RoomMembersPanel: () => <div /> }));

import { RoomView } from "./room-view";

describe("RoomView fillHeight", () => {
  it("uses h-full when fillHeight is set", () => {
    const { container } = render(<RoomView slug="acme" spaceSlug="design" fillHeight />);
    expect((container.firstElementChild as HTMLElement).className).toContain("h-full");
  });

  it("uses the page calc height by default", () => {
    const { container } = render(<RoomView slug="acme" spaceSlug="design" />);
    expect((container.firstElementChild as HTMLElement).className).toContain("min-h-96");
  });
});
