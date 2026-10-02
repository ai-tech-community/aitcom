import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

type Props = Partial<React.ComponentProps<typeof JoinButton>>;

function ui(
  joinPolicy: JoinPolicy,
  membershipStatus: "invited" | "active" | null,
  locale: "en" | "nl" = "en",
  props: Props = {},
) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <JoinButton
        slug="makers"
        name="Makers"
        joinPolicy={joinPolicy}
        membershipStatus={membershipStatus}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

function renderButton(
  joinPolicy: JoinPolicy,
  membershipStatus: "invited" | "active" | null,
  locale: "en" | "nl" = "en",
  props: Props = {},
) {
  return render(ui(joinPolicy, membershipStatus, locale, props));
}

/** A promise the test settles by hand, to look at a pending answer. */
function deferred() {
  let resolve!: (value: { success: boolean }) => void;
  const promise = new Promise<{ success: boolean }>((r) => (resolve = r));
  return { promise, resolve };
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

  it("shows only the pending answer as busy: declining never spins Accept", async () => {
    const pending = deferred();
    s.decline.mockImplementationOnce(() => pending.promise);
    renderButton("invite_only", "invited");
    const accept = screen.getByRole("button", { name: "Accept" });
    const decline = screen.getByRole("button", { name: "Decline" });

    fireEvent.click(decline);
    await waitFor(() => expect(decline).toHaveAttribute("aria-busy", "true"));
    expect(accept).not.toHaveAttribute("aria-busy");
    expect(accept.querySelector(".animate-spin")).toBeNull();
    expect(decline.querySelector(".animate-spin")).not.toBeNull();
    // Neither answer can be sent twice while one is on its way.
    expect(accept).toBeDisabled();
    expect(decline).toBeDisabled();

    await act(async () => pending.resolve({ success: true }));
    await waitFor(() => expect(decline).not.toHaveAttribute("aria-busy"));
  });

  it("moves focus to the given target (the community heading) after accepting", async () => {
    const heading = document.createElement("h1");
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const ref = { current: heading };
    try {
      renderButton("invite_only", "invited", "en", { focusAfterAnswer: ref });
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      await waitFor(() => expect(heading).toHaveFocus());
    } finally {
      heading.remove();
    }
  });

  it("without a target, focuses the control that replaces the answer", async () => {
    const { rerender } = renderButton("invite_only", "invited");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(s.refresh).toHaveBeenCalled());
    // The membership reloads as active: Leave takes the answer's place.
    rerender(ui("invite_only", "active"));
    expect(
      screen.getByRole("button", { name: "Leave Community" }),
    ).toHaveFocus();
  });

  it("fits a tight header in its compact size: one line, small buttons", () => {
    const { container } = renderButton("invite_only", "invited", "en", {
      size: "compact",
    });
    const block = container.querySelector('[data-slot="invite-response"]');
    expect(block).toHaveAttribute("data-variant", "compact");
    expect(screen.getByText("You're invited")).toBeInTheDocument();
    // The full sentence stays for screen readers.
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute(
      "data-size",
      "sm",
    );
    expect(
      screen.getByRole("button", { name: "Accept" }),
    ).toHaveAccessibleDescription("You're invited to join Makers");
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
