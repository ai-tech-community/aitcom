import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

const s = vi.hoisted(() => ({
  accept: vi.fn((_: { slug: string }) => Promise.resolve({ success: true })),
  decline: vi.fn((_: { slug: string }) => Promise.resolve({ success: true })),
  join: vi.fn((_: { slug: string }) => Promise.resolve({ success: true })),
  confirm: vi.fn((_: unknown) => Promise.resolve(true)),
  refresh: vi.fn(),
  invalidated: [] as string[],
}));

vi.mock("@/trpc/react", () => {
  const invalidate = (name: string) => () => {
    s.invalidated.push(name);
    return Promise.resolve();
  };
  return {
    api: {
      useUtils: () => ({
        communities: {
          getMyCommunities: { invalidate: invalidate("getMyCommunities") },
          getBySlug: { invalidate: invalidate("getBySlug") },
          getMembers: { invalidate: invalidate("getMembers") },
        },
        home: { nextUp: { invalidate: invalidate("home.nextUp") } },
        feed: {
          getHomeActivity: { invalidate: invalidate("feed.getHomeActivity") },
        },
      }),
      communities: {
        getMyCommunities: { useQuery: () => ({ data: [] }) },
        join: { useMutation: () => ({ mutateAsync: s.join }) },
        requestToJoin: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        leave: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        acceptInvite: { useMutation: () => ({ mutateAsync: s.accept }) },
        declineInvite: { useMutation: () => ({ mutateAsync: s.decline }) },
      },
    },
  };
});
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: s.refresh }),
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ authStatus: "authenticated", promptAuth: vi.fn() }),
}));
vi.mock("@/components/auth/session-provider", () => ({
  useInitialAuthUser: () => ({ id: "u1" }),
}));
vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => s.confirm,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { JoinButton } from "./join-button";
import type { JoinPolicy } from "@/server/communities/invite-policy";

function renderButton(
  joinPolicy: JoinPolicy,
  membershipStatus: "invited" | null,
  locale: "en" | "nl" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <JoinButton
        slug="makers"
        name="Makers"
        joinPolicy={joinPolicy}
        membershipStatus={membershipStatus}
      />
    </NextIntlClientProvider>,
  );
}

describe("JoinButton for an invited member", () => {
  beforeEach(() => {
    s.invalidated = [];
    s.confirm.mockReset();
    s.confirm.mockImplementation(() => Promise.resolve(true));
    s.accept.mockClear();
    s.decline.mockClear();
    s.join.mockClear();
    s.refresh.mockClear();
  });

  it.each(["open", "approval_required", "invite_only"] as const)(
    "offers Accept and Decline on a %s community",
    (joinPolicy) => {
      renderButton(joinPolicy, "invited");
      expect(
        screen.getByText("You're invited to join Makers"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /join/i })).toBeNull();
    },
  );

  it("accepts with the community's slug, then refreshes the page and Home", async () => {
    renderButton("invite_only", "invited");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(s.accept).toHaveBeenCalledWith({ slug: "makers" }),
    );
    expect(s.join).not.toHaveBeenCalled();
    await waitFor(() => expect(s.refresh).toHaveBeenCalledTimes(1));
    expect(s.invalidated).toEqual(
      expect.arrayContaining([
        "getMyCommunities",
        "getBySlug",
        "home.nextUp",
        "feed.getHomeActivity",
      ]),
    );
  });

  it("asks before declining, and does nothing when the member cancels", async () => {
    s.confirm.mockImplementation(() => Promise.resolve(false));
    renderButton("invite_only", "invited");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(s.confirm).toHaveBeenCalledTimes(1));
    expect(s.decline).not.toHaveBeenCalled();
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it("declines with the slug once confirmed", async () => {
    renderButton("open", "invited");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(s.decline).toHaveBeenCalledWith({ slug: "makers" }),
    );
    expect(s.confirm).toHaveBeenCalledBefore(s.decline);
  });

  it("shows nothing to an uninvited visitor of an invite-only community", () => {
    const { container } = renderButton("invite_only", null);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders in Dutch", () => {
    renderButton("invite_only", "invited", "nl");
    expect(
      screen.getByText("Je bent uitgenodigd om lid te worden van Makers"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accepteren" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Afwijzen" })).toBeTruthy();
  });
});
