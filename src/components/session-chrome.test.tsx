import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => {
    function LazyChrome({ dockLeading }: { dockLeading?: React.ReactNode }) {
      return <div data-testid="lazy-chrome">{dockLeading}</div>;
    }
    return LazyChrome;
  },
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

import { SessionProvider } from "@/components/auth/session-provider";
import { SessionChrome } from "./session-chrome";

const USER = { id: "ada", name: "Ada Lovelace" };

describe("SessionChrome", () => {
  it("does not mount inbox, space-window or badge celebration chrome for a guest", () => {
    render(
      <SessionProvider initialUser={null}>
        <SessionChrome />
      </SessionProvider>,
    );

    expect(screen.queryByTestId("lazy-chrome")).toBeNull();
  });

  it("mounts the lazy chrome once a signed-in user exists", () => {
    render(
      <SessionProvider initialUser={USER}>
        <SessionChrome initialUser={USER} />
      </SessionProvider>,
    );

    // Inbox (with the getting-started reminder in its dock), space windows
    // and the badge earning moment.
    const chrome = screen.getAllByTestId("lazy-chrome");
    expect(chrome).toHaveLength(4);
    expect(chrome[0]).toContainElement(chrome[1]!);
  });
});
