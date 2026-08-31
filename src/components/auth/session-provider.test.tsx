import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  documentAuthUser,
  hubDocumentPaint,
} from "@/server/better-auth/hub-session";

import {
  PageDocumentAuthProvider,
  SessionProvider,
  useInitialAuthUser,
  usePageDocumentAuthUser,
} from "./session-provider";

const SOREN = { id: "soren-ravn", name: "Soren Ravn" };
const MEMBERSHIPS = [
  { slug: "ait" as const, status: "active" as const, role: "member" as const },
];

function Header() {
  const user = documentAuthUser(null, useInitialAuthUser(), null);
  const paint = hubDocumentPaint(user, MEMBERSHIPS);
  return <span>{paint.navbarJoin ? "JOIN" : "Member"}</span>;
}

function Forum() {
  const user = documentAuthUser(
    useInitialAuthUser(),
    usePageDocumentAuthUser(),
    null,
  );
  const paint = hubDocumentPaint(user, MEMBERSHIPS);
  return (
    <span>{paint.forumSignInToPost ? "Sign in to post" : "composer"}</span>
  );
}

describe("leftover after #251: header and forum follow the Hub document seed", () => {
  it("first paint: page seed Member hides JOIN and Sign in to post", () => {
    render(
      <SessionProvider initialUser={null}>
        <Header />
        <PageDocumentAuthProvider user={SOREN}>
          <Forum />
        </PageDocumentAuthProvider>
      </SessionProvider>,
    );

    expect(screen.queryByText("JOIN")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in to post")).not.toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("composer")).toBeInTheDocument();
  });

  it("guest locale seed does not wipe a published Member", () => {
    const { rerender } = render(
      <SessionProvider initialUser={SOREN}>
        <Header />
        <PageDocumentAuthProvider user={SOREN}>
          <Forum />
        </PageDocumentAuthProvider>
      </SessionProvider>,
    );

    rerender(
      <SessionProvider initialUser={null}>
        <Header />
        <PageDocumentAuthProvider user={SOREN}>
          <Forum />
        </PageDocumentAuthProvider>
      </SessionProvider>,
    );

    expect(screen.queryByText("JOIN")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in to post")).not.toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
  });
});
