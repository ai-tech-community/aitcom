import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

const m = vi.hoisted(() => ({
  action: { kind: "member", canLeave: true } as {
    kind: string;
    canLeave?: boolean;
  },
  leave: vi.fn(async () => undefined),
  onChange: undefined as (() => void) | undefined,
  refresh: vi.fn(),
  busy: false,
}));

vi.mock("./use-community-join", () => ({
  useCommunityJoin: (opts: { onChange?: () => void }) => {
    m.onChange = opts.onChange;
    return { action: m.action, leave: m.leave, run: vi.fn(), busy: m.busy };
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));

import { CommunityActionsMenu } from "./community-actions-menu";

function renderMenu(onLeft = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityActionsMenu
        slug="mlops"
        name="MLOps Amsterdam"
        joinPolicy="open"
        membershipStatus="active"
        memberRole="member"
        onLeft={onLeft}
      />
    </NextIntlClientProvider>,
  );
  return onLeft;
}

beforeEach(() => {
  m.action = { kind: "member", canLeave: true };
  m.leave.mockClear();
  m.refresh.mockClear();
  m.busy = false;
});

describe("CommunityActionsMenu", () => {
  it("lets a member leave from the menu", async () => {
    renderMenu();
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: en.communities.profile.communityActions,
      }),
      { key: "Enter" },
    );
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("menuitem", {
          name: en.communities.profile.leave,
        }),
      );
    });
    expect(m.leave).toHaveBeenCalledOnce();
  });

  it("after leaving, tells the identity and refreshes the page data", () => {
    const onLeft = renderMenu();
    m.onChange?.();
    expect(onLeft).toHaveBeenCalledOnce();
    expect(m.refresh).toHaveBeenCalledOnce();
  });

  it("marks the menu button busy while leaving runs", () => {
    m.busy = true;
    renderMenu();
    expect(
      screen.getByRole("button", {
        name: en.communities.profile.communityActions,
      }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("renders nothing for someone who cannot leave, such as the owner", () => {
    m.action = { kind: "member", canLeave: false };
    renderMenu();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for someone who is not a member", () => {
    m.action = { kind: "join" };
    renderMenu();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
