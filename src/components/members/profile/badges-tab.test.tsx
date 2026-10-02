import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { toTrackProgress } from "@/lib/badges/progress";
import type { Showcase } from "@/lib/badges/showcase";
import type { BadgeRarityReport } from "@/server/badges/rarity";
import type { ProfileAward } from "@/server/members/profile-awards";

const calls = vi.hoisted(() => ({
  pin: [] as unknown[],
  unpin: [] as unknown[],
  refresh: 0,
}));

vi.mock("@/trpc/react", () => {
  const mutation = (log: unknown[]) => ({
    useMutation: (opts: { onSuccess?: () => void }) => ({
      mutate: (input: unknown) => {
        log.push(input);
        opts.onSuccess?.();
      },
      reset: () => undefined,
      isPending: false,
      isError: false,
    }),
  });
  return {
    api: { badges: { pin: mutation(calls.pin), unpin: mutation(calls.unpin) } },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => (calls.refresh += 1) }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { BadgesTab } from "./badges-tab";

const HELD = [
  { slug: "first_event", earnedAt: new Date("2026-01-10T12:00:00Z") },
  { slug: "regular", earnedAt: new Date("2026-02-01T12:00:00Z") },
  { slug: "article_author", earnedAt: new Date("2026-03-03T12:00:00Z") },
  { slug: "profile_complete", earnedAt: new Date("2026-01-02T12:00:00Z") },
  { slug: "early_adopter", earnedAt: new Date("2025-12-01T12:00:00Z") },
];

const RARITY: BadgeRarityReport = {
  members: 200,
  badges: [
    { slug: "first_event", measure: "share", holders: 120, share: 0.6 },
    { slug: "regular", measure: "share", holders: 8, share: 0.04 },
    { slug: "article_author", measure: "share", holders: 1, share: 0.005 },
    { slug: "profile_complete", measure: "share", holders: 90, share: 0.45 },
    { slug: "early_adopter", measure: "count", holders: 37, editionSize: 100 },
  ],
};

const AWARDS: ProfileAward[] = [
  {
    id: "a1",
    label: "Winner — RAG Hack 2026",
    earnedAt: "2026-04-01T12:00:00Z",
    challenge: { title: "RAG Hack 2026", slug: "rag-hack-2026" },
  },
  {
    id: "a2",
    label: "Finalist — Draft Jam",
    earnedAt: "2026-04-02T12:00:00Z",
    challenge: null,
  },
];

const RAREST: Showcase = { slugs: ["article_author"], source: "rarest" };

function renderTab(
  props: Partial<React.ComponentProps<typeof BadgesTab>> & {
    viewer: React.ComponentProps<typeof BadgesTab>["viewer"];
  },
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <BadgesTab
        held={HELD}
        awards={AWARDS}
        rarity={RARITY}
        showcase={RAREST}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const ownerProgress = [
  toTrackProgress("regular", 4),
  toTrackProgress("writer", 3),
];

beforeEach(() => {
  calls.pin.length = 0;
  calls.unpin.length = 0;
  calls.refresh = 0;
});

describe("BadgesTab — visitor", () => {
  it("shows only earned badges: no locked tier, progress or pin control", () => {
    const { container } = renderTab({ viewer: { kind: "visitor" } });
    expect(container.querySelector('[data-state="locked"]')).toBeNull();
    expect(screen.queryByTestId("track-next")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Not earned yet/)).toBeNull();
    expect(screen.queryByText(/Pin up to/)).toBeNull();
  });

  it("groups by kind: earned tracks, milestones, limited editions, awards", () => {
    const { container } = renderTab({ viewer: { kind: "visitor" } });
    expect(
      [...container.querySelectorAll("[data-track]")].map((el) =>
        el.getAttribute("data-track"),
      ),
    ).toEqual(["regular", "writer"]);
    expect(
      [...container.querySelectorAll("[data-badge]")].map((el) =>
        el.getAttribute("data-badge"),
      ),
    ).toEqual(["profile_complete", "early_adopter"]);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Tracks2", "Milestones1", "Limited editions1", "Awards2"]);
  });

  it("shows a track's highest tier large and its lower earned tiers small", () => {
    const { container } = renderTab({ viewer: { kind: "visitor" } });
    const regular = container.querySelector('[data-track="regular"]')!;
    expect(
      within(regular as HTMLElement).getByText("Regular II"),
    ).toBeInTheDocument();
    const lower = within(regular as HTMLElement).getByRole("list", {
      name: "Other tiers of Regular",
    });
    expect(
      within(lower).getByRole("img", {
        name: "Regular, tier I, earned January 10, 2026",
      }),
    ).toBeInTheDocument();
    expect(within(lower).getAllByRole("img")).toHaveLength(1);
  });

  it("says how rare each badge is", () => {
    renderTab({ viewer: { kind: "visitor" } });
    expect(
      screen.getByText(/Earned Feb 1, 2026 · Earned by 4% of members/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Fewer than 1% of members/)).toBeInTheDocument();
    expect(screen.getByText(/37 of 100 claimed/)).toBeInTheDocument();
  });

  it("shows awards with their label, and the challenge link when there is one", () => {
    renderTab({ viewer: { kind: "visitor" } });
    expect(screen.getByText("Winner — RAG Hack 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RAG Hack 2026" })).toHaveAttribute(
      "href",
      "/challenges/rag-hack-2026",
    );
    const draft = screen.getByText("Finalist — Draft Jam").closest("li")!;
    expect(within(draft).queryByRole("link")).toBeNull();
  });
});

describe("BadgesTab — owner", () => {
  it("adds locked tiers with progress and untouched tracks after earned ones", () => {
    const { container } = renderTab({
      viewer: { kind: "owner", progress: ownerProgress },
    });
    const tracks = [...container.querySelectorAll("[data-track]")].map((el) =>
      el.getAttribute("data-track"),
    );
    expect(tracks.slice(0, 2)).toEqual(["regular", "writer"]);
    expect(tracks).toHaveLength(11);

    const regular = container.querySelector<HTMLElement>(
      '[data-track="regular"]',
    )!;
    expect(
      within(regular).getByRole("img", {
        name: "Regular, tier III, locked, 4 of 10",
      }),
    ).toBeInTheDocument();
    expect(within(regular).getByTestId("track-next")).toHaveTextContent(
      "Next: Regular III, 4 of 10 events",
    );

    const writer = container.querySelector<HTMLElement>(
      '[data-track="writer"]',
    )!;
    expect(within(writer).getByTestId("track-next")).toHaveTextContent(
      "Next: Writer II, 3 of 5 articles",
    );
  });

  it("shows locked milestones but never a locked limited edition", () => {
    renderTab({
      viewer: { kind: "owner", progress: ownerProgress },
      held: HELD.filter((b) => b.slug !== "early_adopter"),
    });
    expect(screen.getByText("Onboarding complete")).toBeInTheDocument();
    expect(screen.queryByText("Early adopter")).toBeNull();
  });

  it("shows a locked tier without progress when its metric did not load", () => {
    renderTab({ viewer: { kind: "owner", progress: [] } });
    expect(
      screen.getByRole("img", { name: "Regular, tier III, locked" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("track-next")).toBeNull();
  });

  it("pins an earned badge to the showcase", () => {
    renderTab({ viewer: { kind: "owner", progress: ownerProgress } });
    expect(screen.getByText(/Pin up to 3 badges/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Pin Regular II to your showcase" }),
    );
    expect(calls.pin).toEqual([{ slug: "regular" }]);
    expect(calls.refresh).toBe(1);
    // Locked entries have no pin control.
    expect(
      screen.queryByRole("button", { name: /Onboarding complete/ }),
    ).toBeNull();
  });

  it("unpins a pinned track by the stored slug", () => {
    renderTab({
      viewer: { kind: "owner", progress: ownerProgress },
      showcase: { slugs: ["regular"], source: "pinned" },
    });
    expect(
      screen.getByText("1 of 3 pinned to your showcase."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Unpin Regular II from your showcase",
      }),
    );
    expect(calls.unpin).toEqual([{ slug: "regular" }]);
  });

  it("marks Pin unavailable when the showcase is full, keeps it focusable and describes why", () => {
    renderTab({
      viewer: { kind: "owner", progress: ownerProgress },
      showcase: {
        slugs: ["regular", "article_author", "profile_complete"],
        source: "pinned",
      },
    });
    const pin = screen.getByRole("button", {
      name: "Pin Early adopter to your showcase",
    });
    expect(pin).toHaveAttribute("aria-disabled", "true");
    expect(pin).not.toBeDisabled();
    pin.focus();
    expect(pin).toHaveFocus();
    fireEvent.click(pin);
    expect(calls.pin).toEqual([]);
    const hint = document.getElementById(pin.getAttribute("aria-describedby")!);
    expect(hint).toHaveTextContent("Your showcase is full (3 of 3)");
    expect(
      screen.getByRole("button", { name: "Unpin Writer I from your showcase" }),
    ).toBeEnabled();
  });

  it("caps progress: a tier the metric already meets reads 'being added', never '12 of 1'", () => {
    const { container } = renderTab({
      viewer: {
        kind: "owner",
        progress: [toTrackProgress("writer", 12)],
      },
      held: HELD.filter((b) => b.slug !== "article_author"),
    });
    const writer = container.querySelector<HTMLElement>(
      '[data-track="writer"]',
    )!;
    expect(within(writer).getByText("Being added")).toBeInTheDocument();
    expect(within(writer).getByTestId("track-next")).toHaveTextContent(
      "Next: Writer I, being added",
    );
    expect(
      within(writer).getByRole("img", { name: "Writer, tier II, being added" }),
    ).toBeInTheDocument();
    expect(
      within(writer).getByRole("img", {
        name: "Writer, tier III, locked, 12 of 15",
      }),
    ).toBeInTheDocument();
    expect(writer.textContent).not.toMatch(/12 of (1|5)\b/);
  });
});
