import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ shell: null as null | "community" | "hub" }));

vi.mock("./site-chrome-gate", () => ({
  useSiteShell: () => m.shell,
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    function LazyChrome({
      dockLeading,
      showLauncher,
    }: {
      dockLeading?: React.ReactNode;
      showLauncher?: boolean;
    }) {
      return (
        <div data-testid="lazy-chrome" data-launcher={showLauncher}>
          {dockLeading}
        </div>
      );
    }
    return LazyChrome;
  },
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/" }));

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
    expect(chrome[0]).toHaveAttribute("data-launcher", "true");
  });

  it.each(["community", "hub"] as const)(
    "keeps chat windows but hides the floating launchers in the %s shell",
    (shell) => {
      m.shell = shell;
      try {
        render(
          <SessionProvider initialUser={USER}>
            <SessionChrome initialUser={USER} />
          </SessionProvider>,
        );
        const chrome = screen.getAllByTestId("lazy-chrome");
        expect(chrome).toHaveLength(3);
        expect(chrome[0]).toHaveAttribute("data-launcher", "false");
      } finally {
        m.shell = null;
      }
    },
  );
});
