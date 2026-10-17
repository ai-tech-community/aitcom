import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

type Query = {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

const state = vi.hoisted(() => ({
  prefs: undefined as unknown as Query,
  communities: undefined as unknown as Query,
  setHubMail: vi.fn(),
  setOptout: vi.fn(),
  hubMailOptions: undefined as { onError?: () => void } | undefined,
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: state.toastError, success: vi.fn() },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      notificationPrefs: { get: { invalidate: vi.fn() } },
    }),
    notificationPrefs: {
      get: { useQuery: () => state.prefs },
      setOptout: {
        useMutation: () => ({ mutate: state.setOptout, isPending: false }),
      },
      setHubMail: {
        useMutation: (options?: { onError?: () => void }) => {
          state.hubMailOptions = options;
          return { mutate: state.setHubMail, isPending: false };
        },
      },
    },
    communities: {
      getMyCommunities: { useQuery: () => state.communities },
    },
  },
}));

import { NotificationPrefs } from "./notification-prefs";

const PREFS = {
  digestOptOutCommunityIds: ["c2"],
  broadcastOptOutCommunityIds: [],
  digestOptOutSections: ["news"],
  globalDigestOptOut: false,
  hubMail: {
    dm: true,
    mention: true,
    forumReply: false,
    digest: true,
    agentJob: false,
  },
};

function loaded(data: unknown): Query {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

function renderPrefs() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NotificationPrefs />
    </NextIntlClientProvider>,
  );
}

describe("NotificationPrefs", () => {
  beforeEach(() => {
    state.prefs = loaded(PREFS);
    state.communities = loaded([
      { communityId: "c1", name: "Makers", status: "active" },
      { communityId: "c2", name: "Readers", status: "active" },
      { communityId: "c3", name: "Waiting", status: "pending_approval" },
    ]);
    state.setHubMail.mockReset();
    state.setOptout.mockReset();
    state.toastError.mockReset();
  });

  it("is one Settings section with an h2 and sans sub-headings", () => {
    renderPrefs();

    expect(
      screen.getByRole("heading", { level: 2, name: /email notifications/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Hub emails" }),
    ).toBeTruthy();
  });

  it("shows a skeleton while loading", () => {
    state.prefs = { ...loaded(undefined), isPending: true };
    const { container } = renderPrefs();

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows an error with retry when the preferences cannot load", () => {
    const refetch = vi.fn();
    state.prefs = { ...loaded(undefined), isError: true, refetch };
    renderPrefs();

    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows each switch with its saved value and saves a change", () => {
    renderPrefs();

    expect(
      screen.getByRole("switch", { name: "Hub messages" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Makers – Digest section" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Readers – Digest section" }),
    ).toHaveAttribute("aria-checked", "false");
    // Only communities the member is active in.
    expect(screen.queryByText("Waiting")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Forum replies" }));
    expect(state.setHubMail).toHaveBeenCalledWith({
      case: "forumReply",
      enabled: true,
    });
  });

  it("says so when a change cannot be saved", () => {
    renderPrefs();
    state.hubMailOptions?.onError?.();
    expect(state.toastError).toHaveBeenCalledWith(
      "Couldn't save that change. Please try again.",
    );
  });
  it("keeps the Hub and digest switches when only the community list fails", () => {
    const refetch = vi.fn();
    state.communities = { ...loaded(undefined), isError: true, refetch };
    renderPrefs();

    expect(screen.getByRole("switch", { name: "Hub messages" })).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Weekly digest email" }),
    ).toBeTruthy();
    expect(screen.queryByText("Per community")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("lists digest sections on by default and saves a section opt-out", () => {
    renderPrefs();

    expect(
      screen.getByRole("heading", { level: 3, name: "Weekly digest" }),
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "News" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      screen.getByRole("checkbox", { name: "Community highlights" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Events" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "Jobs" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "Startups" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Jobs" }));
    expect(state.setOptout).toHaveBeenCalledWith({
      communityId: null,
      category: "digest:jobs",
      optedOut: true,
    });
  });

  it("disables section choices while the master digest switch is off", () => {
    state.prefs = loaded({ ...PREFS, globalDigestOptOut: true });
    renderPrefs();

    expect(screen.getByRole("checkbox", { name: "News" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Startups" })).toBeDisabled();
    expect(
      screen.getByText("Turn the weekly digest on to choose sections."),
    ).toBeTruthy();
  });

  it("is reachable from the emails' 'Manage notifications' link", () => {
    const { container } = renderPrefs();
    expect(container.querySelector("section#notifications")).not.toBeNull();
  });
});
