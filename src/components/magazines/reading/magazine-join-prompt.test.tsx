import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommunityJoin } from "@/components/communities/use-community-join";
import { rememberJoinIntent } from "@/components/communities/join-community-link";
import type * as JoinCommunityLink from "@/components/communities/join-community-link";
import { renderWithIntl } from "../test-intl";

const s = vi.hoisted(() => ({
  authStatus: "authenticated",
  mine: [] as { slug: string; status: string; role: string }[],
  join: vi.fn(),
  request: vi.fn(),
  accept: vi.fn(),
  promptAuth: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/components/communities/join-community-link", async (original) => {
  const actual = await original<typeof JoinCommunityLink>();
  return { ...actual, rememberJoinIntent: vi.fn(actual.rememberJoinIntent) };
});
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: s.authStatus,
    promptAuth: s.promptAuth,
  }),
}));
vi.mock("@/components/auth/session-provider", () => ({
  useInitialAuthUser: () => null,
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: s.refresh }),
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/trpc/react", () => {
  const invalidate = vi.fn();
  return {
    api: {
      useUtils: () => ({
        communities: {
          getMyCommunities: { invalidate, fetch: async () => s.mine },
          getBySlug: {
            invalidate,
            fetch: async () => ({ name: "ACME", joinPolicy: "open" }),
          },
          getMembers: { invalidate },
        },
        home: { nextUp: { invalidate } },
        feed: { getHomeActivity: { invalidate } },
      }),
      communities: {
        getMyCommunities: { useQuery: () => ({ data: s.mine }) },
        join: { useMutation: () => ({ mutateAsync: s.join }) },
        requestToJoin: { useMutation: () => ({ mutateAsync: s.request }) },
        leave: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        acceptInvite: { useMutation: () => ({ mutateAsync: s.accept }) },
        declineInvite: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
    },
  };
});

import {
  MagazineJoinPrompt,
  MagazineJoinPromptView,
  MagazineJoinPromptProvider,
} from "./magazine-join-prompt";

const community = { slug: "acme", name: "ACME", joinPolicy: "open" } as const;
const source = { via: "magazine", magazineId: 1, issueId: 2 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  s.refresh.mockReset();
  s.authStatus = "authenticated";
  s.mine = [];
  s.join.mockResolvedValue({ success: true });
  s.request.mockResolvedValue({ success: true });
  s.accept.mockResolvedValue({ success: true });
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function view(
  action: CommunityJoin["action"],
  variant: "panel" | "inline" = "panel",
  busy = false,
) {
  const onRun = vi.fn();
  const rendered = renderWithIntl(
    <MagazineJoinPromptView
      community={community}
      variant={variant}
      action={action}
      onRun={onRun}
      busy={busy}
      invite={<button>Accept invitation</button>}
    />,
  );
  return { ...rendered, onRun };
}

describe("MagazineJoinPromptView", () => {
  it.each([
    ["join", "Join ACME"],
    ["request", "Ask to join ACME"],
  ] as const)("offers %s", (kind, label) => {
    const { onRun } = view({ kind });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onRun).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Read the whole issue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ACME members read every article in full."),
    ).toBeInTheDocument();
  });

  it("explains a pending request", () => {
    view({ kind: "pending" });
    expect(
      screen.getByText(
        "You asked to join ACME. You can read everything once you are let in.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains invite only and links to the community", () => {
    view({ kind: "invite_only" });
    expect(
      screen.getByText("ACME is invite only. Ask a member for an invite."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visit ACME" })).toHaveAttribute(
      "href",
      "/communities/acme",
    );
  });

  it.each([
    { kind: "member", canLeave: true },
    { kind: "unavailable" },
  ] as const)("hides for $kind", (action) => {
    expect(view(action).container).toBeEmptyDOMElement();
  });

  it("shows the invitation response", () => {
    view({ kind: "invited" });
    expect(
      screen.getByRole("button", { name: "Accept invitation" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join ACME" })).toBeNull();
  });

  it("panel is the one orange button, inline is outline", () => {
    const { unmount } = view({ kind: "join" });
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "default",
    );
    unmount();
    view({ kind: "join" }, "inline");
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(
      screen.getByText("Members of ACME read the whole article."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("disables the button while busy", () => {
    view({ kind: "request" }, "panel", true);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});

describe("MagazineJoinPrompt", () => {
  it("responsive copies finish a remembered sign-in once and share the busy state", async () => {
    rememberJoinIntent("acme", undefined, source);
    window.history.replaceState(null, "", "/en/magazines/m/i?join=acme");
    let finish: () => void = () => undefined;
    s.join.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderWithIntl(
      <MagazineJoinPromptProvider
        community={community}
        source={source}
        focusTargetId="t"
      >
        <MagazineJoinPrompt
          community={community}
          source={source}
          variant="panel"
          focusTargetId="t"
        />
        <MagazineJoinPrompt
          community={community}
          source={source}
          variant="panel"
          focusTargetId="t"
        />
      </MagazineJoinPromptProvider>,
    );
    await waitFor(() =>
      expect(s.join).toHaveBeenCalledExactlyOnceWith({ slug: "acme", source }),
    );
    for (const button of screen.getAllByRole("button", { name: "Join ACME" }))
      expect(button).toBeDisabled();
    finish();
    await waitFor(() => expect(s.refresh).toHaveBeenCalledOnce());
  });

  it("shares a pending invitation response between responsive panel copies", async () => {
    s.mine = [{ slug: "acme", status: "invited", role: "member" }];
    let finish: () => void = () => undefined;
    s.accept.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = renderWithIntl(
      <MagazineJoinPromptProvider
        community={community}
        source={source}
        focusTargetId="t"
      >
        <MagazineJoinPrompt
          community={community}
          source={source}
          variant="panel"
          focusTargetId="t"
        />
        <MagazineJoinPrompt
          community={community}
          source={source}
          variant="panel"
          focusTargetId="t"
        />
      </MagazineJoinPromptProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]!);
    await waitFor(() => {
      for (const button of screen.getAllByRole("button"))
        expect(button).toBeDisabled();
    });
    expect(s.accept).toHaveBeenCalledExactlyOnceWith({ slug: "acme" });
    const ids = [...container.querySelectorAll("[id]")].map(
      (element) => element.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    finish();
    await waitFor(() => expect(s.refresh).toHaveBeenCalledOnce());
  });

  it("a guest is asked to sign in and the source is remembered", () => {
    s.authStatus = "guest";
    renderWithIntl(
      <MagazineJoinPrompt
        community={community}
        source={source}
        variant="panel"
        focusTargetId="t"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Join ACME" }));
    expect(s.promptAuth).toHaveBeenCalled();
    expect(rememberJoinIntent).toHaveBeenCalledWith("acme", undefined, source);
    expect(s.join).not.toHaveBeenCalled();
  });

  it.each(["open", "approval_required"] as const)(
    "after joining, focus moves to the page heading (%s)",
    async (joinPolicy) => {
      s.refresh.mockImplementation(() =>
        expect(document.activeElement).toBe(
          screen.getByRole("heading", { level: 1 }),
        ),
      );
      renderWithIntl(
        <>
          <h1 id="t" tabIndex={-1}>
            Issue title
          </h1>
          <MagazineJoinPrompt
            community={{ ...community, joinPolicy }}
            source={source}
            variant="panel"
            focusTargetId="t"
          />
        </>,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: joinPolicy === "open" ? "Join ACME" : "Ask to join ACME",
        }),
      );
      await waitFor(() => expect(s.refresh).toHaveBeenCalledOnce());
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 1 }),
      );
      expect(joinPolicy === "open" ? s.join : s.request).toHaveBeenCalledWith({
        slug: "acme",
        source,
      });
    },
  );

  it("the panel finishes a guest's remembered join after sign-in", async () => {
    rememberJoinIntent("acme", undefined, source);
    window.history.replaceState(null, "", "/en/magazines/m/i?join=acme");
    renderWithIntl(
      <MagazineJoinPrompt
        community={community}
        source={source}
        variant="panel"
        focusTargetId="t"
      />,
    );
    await waitFor(() =>
      expect(s.join).toHaveBeenCalledWith({ slug: "acme", source }),
    );
    await waitFor(() => expect(s.refresh).toHaveBeenCalledOnce());
  });

  it("shows the existing invitation control", () => {
    s.mine = [{ slug: "acme", status: "invited", role: "member" }];
    renderWithIntl(
      <MagazineJoinPrompt
        community={community}
        source={source}
        variant="panel"
        focusTargetId="t"
      />,
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });
});
