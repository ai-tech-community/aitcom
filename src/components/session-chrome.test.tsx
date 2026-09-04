import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => {
    function LazyChrome() {
      return <div data-testid="lazy-chrome" />;
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
  it("does not load inbox or space-window chunks for a guest", () => {
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

    expect(screen.getAllByTestId("lazy-chrome")).toHaveLength(2);
  });
});
