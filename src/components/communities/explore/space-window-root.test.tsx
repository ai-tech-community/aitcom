import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("@/components/inbox/use-inbox-stream", () => ({ useInboxStream: vi.fn() }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u" } } }) },
}));
vi.mock("@/components/communities/rooms/room-view", () => ({
  RoomView: ({ spaceSlug }: { spaceSlug: string }) => <div data-testid="roomview">{spaceSlug}</div>,
}));
vi.mock("@/components/community/building-modal", () => ({
  BuildingModal: ({ title, children, onClose, onMinimize }: {
    title: string; children: React.ReactNode; onClose: () => void; onMinimize?: () => void;
  }) => (
    <div data-testid="window">
      <span data-testid="window-title">{title}</span>
      <button onClick={onMinimize}>min</button>
      <button onClick={onClose}>close</button>
      {children}
    </div>
  ),
}));

import { SpaceWindowProvider, useSpaceWindows } from "./space-window-provider";
import { SpaceWindowRoot } from "./space-window-root";

function Harness() {
  const { openSpace } = useSpaceWindows();
  return (
    <button
      onClick={() =>
        openSpace({ communitySlug: "acme", spaceSlug: "design", spaceName: "Design", communityName: "ACME" })
      }
    >
      open
    </button>
  );
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
});

describe("SpaceWindowRoot", () => {
  it("opens exactly one window with the space name and RoomView", () => {
    render(
      <SpaceWindowProvider>
        <Harness />
        <SpaceWindowRoot />
      </SpaceWindowProvider>,
    );
    expect(screen.queryByTestId("window")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getAllByTestId("window")).toHaveLength(1);
    expect(screen.getByTestId("window-title")).toHaveTextContent("Design");
    expect(screen.getByTestId("roomview")).toHaveTextContent("design");
  });

  it("minimizes to a taskbar restore button and restores", () => {
    render(
      <SpaceWindowProvider>
        <Harness />
        <SpaceWindowRoot />
      </SpaceWindowProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("min"));
    expect(screen.queryByTestId("window")).not.toBeInTheDocument();
    const restore = screen.getByRole("button", { name: /Design/ });
    fireEvent.click(restore);
    expect(screen.getByTestId("window")).toBeInTheDocument();
  });
});
