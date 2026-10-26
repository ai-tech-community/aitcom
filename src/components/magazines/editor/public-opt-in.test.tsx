import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { IssueVisibility } from "@/lib/magazines/values";

import { renderWithIntl } from "../test-intl";

import { PublicOptIn, publicOptInRequired } from "./public-opt-in";

const WARNING =
  "Your community is private. If you show this to everyone, anyone on the internet will see your community's name and a link to it. Your members, posts and other pages stay private.";
const CONFIRM = "I understand, show this outside the community";

/** A save button wired the way the settings form and the builder wire it. */
function Harness({
  communityIsPrivate,
  initial,
}: {
  communityIsPrivate: boolean;
  initial: IssueVisibility;
}) {
  const [value, setValue] = useState<IssueVisibility>(initial);
  const [confirmed, setConfirmed] = useState(false);
  const blocked = communityIsPrivate && value === "public" && !confirmed;
  return (
    <div>
      <button type="button" onClick={() => setValue("public")}>
        Everyone
      </button>
      <PublicOptIn
        communityIsPrivate={communityIsPrivate}
        value={value}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
      />
      <button type="button" disabled={blocked}>
        Save
      </button>
    </div>
  );
}

describe("PublicOptIn", () => {
  it("appears only for public in a private community and blocks save until checked", () => {
    const { unmount } = renderWithIntl(
      <Harness communityIsPrivate={false} initial="public" />,
    );
    expect(screen.queryByText(WARNING)).toBeNull();
    unmount();

    renderWithIntl(<Harness communityIsPrivate initial="members" />);
    expect(screen.queryByText(WARNING)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Everyone" }));
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: CONFIRM }));
    expect(screen.getByRole("checkbox", { name: CONFIRM })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("publicOptInRequired", () => {
  const unlisted = { slug: "night-owls", isListedInDirectory: false };
  const listed = { slug: "amsterdam-ai", isListedInDirectory: true };
  const members = {
    visibility: "members" as const,
    publicConfirmedBy: null,
    publicConfirmedAt: null,
  };
  const confirmedPublic = {
    visibility: "public" as const,
    publicConfirmedBy: "u1",
    publicConfirmedAt: "2026-10-01T00:00:00.000Z",
  };

  it("asks for public in an unlisted community that has not confirmed it", () => {
    expect(
      publicOptInRequired({
        next: "public",
        saved: members,
        community: unlisted,
      }),
    ).toBe(true);
  });

  it("does not ask for members, in a listed community, or when already confirmed", () => {
    expect(
      publicOptInRequired({
        next: "members",
        saved: members,
        community: unlisted,
      }),
    ).toBe(false);
    expect(
      publicOptInRequired({
        next: "public",
        saved: members,
        community: listed,
      }),
    ).toBe(false);
    expect(
      publicOptInRequired({
        next: "public",
        saved: confirmedPublic,
        community: unlisted,
      }),
    ).toBe(false);
  });
});
