import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SessionProvider,
  useInitialAuthUser,
  usePublishDocumentAuthUser,
} from "./session-provider";

function HeaderAndForum() {
  const user = useInitialAuthUser();
  return (
    <div>
      <span>{user ? "Member" : "JOIN"}</span>
      <span>{user ? "composer" : "Sign in to post"}</span>
    </div>
  );
}

function HubBody({
  user,
}: {
  user: { id: string; name?: string | null } | null;
}) {
  usePublishDocumentAuthUser(user);
  return <span>{user ? "Member" : "guest"}</span>;
}

describe("leftover after #251: header and forum follow the Hub document seed", () => {
  it("first paint: page seed Member hides JOIN and Sign in to post", async () => {
    render(
      <SessionProvider initialUser={null}>
        <HeaderAndForum />
        <HubBody
          user={{
            id: "soren-ravn",
            name: "Soren Ravn",
          }}
        />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText("JOIN")).not.toBeInTheDocument();
      expect(screen.queryByText("Sign in to post")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Member").length).toBeGreaterThan(0);
    expect(screen.getByText("composer")).toBeInTheDocument();
  });
});
