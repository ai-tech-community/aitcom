import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ViewerJoinAction } from "@/server/communities/invite-policy";

const s = vi.hoisted(() => ({
  action: { kind: "join" } as ViewerJoinAction,
  run: vi.fn(() => Promise.resolve()),
  busy: false,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/components/communities/use-community-join", () => ({
  useCommunityJoin: () => ({ action: s.action, run: s.run, busy: s.busy }),
}));

import { JoinAction } from "./join-action";

function renderAction() {
  return render(<JoinAction slug="acme" name="ACME" joinPolicy="open" />);
}

afterEach(() => {
  s.action = { kind: "join" };
  s.busy = false;
  s.run.mockClear();
});

describe("JoinAction", () => {
  it("joins with one click, naming the community for screen readers", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "joinAction: ACME" }));
    expect(s.run).toHaveBeenCalledTimes(1);
  });

  it("asks to join an approval community", () => {
    s.action = { kind: "request" };
    renderAction();
    expect(
      screen.getByRole("button", { name: "requestAction: ACME" }),
    ).toBeInTheDocument();
  });

  it("cannot be pressed twice while working", () => {
    s.busy = true;
    renderAction();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it.each([
    [{ kind: "pending" } as const, "pendingAction"],
    [{ kind: "invite_only" } as const, "inviteOnly"],
    [{ kind: "member", canLeave: true } as const, "youreIn"],
  ])("shows %o as plain status, not a button", (action, label) => {
    s.action = action;
    renderAction();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows nothing to a banned visitor", () => {
    s.action = { kind: "unavailable" };
    const { container } = renderAction();
    expect(container).toBeEmptyDOMElement();
  });
});
