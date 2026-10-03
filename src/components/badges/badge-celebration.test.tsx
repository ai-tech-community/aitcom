import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import type { UnseenEarnings } from "@/server/badges/earning-moment";

const calls = vi.hoisted(() => ({
  pin: [] as unknown[],
  markSeen: [] as unknown[],
  pinResult: { pins: [] as string[] } as { pins: string[] } | Error,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    badges: {
      markSeen: {
        useMutation: () => ({
          mutate: (input: unknown) => calls.markSeen.push(input),
        }),
      },
      pin: {
        useMutation: () => ({
          mutate: (
            input: unknown,
            opts: {
              onSuccess?: (r: { pins: string[] }) => void;
              onError?: () => void;
            },
          ) => {
            calls.pin.push(input);
            if (calls.pinResult instanceof Error) opts.onError?.();
            else opts.onSuccess?.(calls.pinResult);
          },
          reset: () => undefined,
          isPending: false,
        }),
      },
    },
  },
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

import { BadgeCelebrationDialog } from "./badge-celebration";

const USER = "u1";

function earnings(overrides: Partial<UnseenEarnings> = {}): UnseenEarnings {
  return {
    items: [
      {
        kind: "badge",
        id: "b1",
        slug: "article_author",
        earnedAt: "2026-06-02T12:00:00.000Z",
        rarity: {
          slug: "article_author",
          measure: "share",
          holders: 8,
          share: 0.04,
        },
      },
      {
        kind: "badge",
        id: "b2",
        slug: "regular",
        earnedAt: "2026-06-03T12:00:00.000Z",
        rarity: null,
      },
    ],
    moreIds: ["b3", "b4"],
    profile: { pins: [], reach: { kind: "public" } },
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  calls.pin = [];
  calls.markSeen = [];
  calls.pinResult = { pins: [] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BadgeCelebrationDialog", () => {
  it("shows the unseen earnings one at a time, with name, kind, description and rarity", () => {
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={() => undefined}
        />,
      ),
    );
    const dialog = screen.getByRole("dialog", {
      name: "You earned Writer I",
    });
    expect(dialog).toHaveTextContent("1 of 2");
    expect(dialog).toHaveTextContent("Writer · tier I");
    expect(dialog).toHaveTextContent("Published 1 approved article");
    expect(dialog).toHaveTextContent("Earned by 4% of members");
    expect(screen.queryByText(/more are waiting/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("dialog", { name: "You earned Regular II" }),
    ).toHaveTextContent("2 of 2");
    expect(calls.markSeen).toEqual([{ ids: ["b1"] }]);
    // The last one names the rest and links to the Badges tab.
    expect(screen.getByText(/2 more are waiting/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Badges tab" })).toHaveAttribute(
      "href",
      "/members/u1/badges",
    );
  });

  it("pins the badge to the showcase with its slug", () => {
    calls.pinResult = { pins: ["article_author"] };
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={() => undefined}
        />,
      ),
    );
    const button = screen.getByRole("button", { name: "Show on my profile" });
    button.focus();
    fireEvent.click(button);
    expect(calls.pin).toEqual([{ slug: "article_author" }]);
    expect(calls.markSeen).toEqual([{ ids: ["b1"] }]);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("On your profile");
    // The button that had focus is gone: focus moves to what replaced it.
    expect(document.activeElement).toBe(status);
    expect(
      screen.queryByRole("button", { name: "Show on my profile" }),
    ).toBeNull();
  });

  it("offers See badges instead of pinning when the showcase is full", () => {
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings({
            profile: {
              pins: ["first_event", "early_adopter", "course_complete"],
              reach: { kind: "public" },
            },
          })}
          onDone={() => undefined}
        />,
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Show on my profile" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "See badges" })).toHaveAttribute(
      "href",
      "/members/u1/badges",
    );
    expect(screen.getByText(/showcase is full/)).toBeInTheDocument();
  });

  it("switches to See badges when the pin is refused", () => {
    calls.pinResult = new Error("full");
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={() => undefined}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show on my profile" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not add it to your profile",
    );
    const seeBadges = screen.getByRole("link", { name: "See badges" });
    expect(seeBadges).toBeVisible();
    expect(document.activeElement).toBe(seeBadges);
  });

  it("Share shows the badge page link and copies it from the click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={() => undefined}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const url = `${window.location.origin}/en/members/u1/badges/article_author`;
    expect(screen.getByLabelText("Link to share")).toHaveValue(url);
    // Share hides itself: focus goes to the link it revealed.
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Link to share"));
    expect(calls.markSeen).toEqual([{ ids: ["b1"] }]);
    expect(
      screen.getByRole("link", { name: "Open the badge page" }),
    ).toHaveAttribute("href", "/members/u1/badges/article_author");

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(url);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeVisible(),
    );
  });

  it("selects the link to copy by hand when the clipboard is unavailable", () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={() => undefined}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    const input = screen.getByLabelText<HTMLInputElement>("Link to share");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(screen.getByText(/link is selected/)).toBeInTheDocument();
  });

  it("Esc closes it, marks everything it covered seen, and returns focus", async () => {
    const onDone = vi.fn();
    // Focus is on the page's button before the celebration opens.
    const before = document.createElement("button");
    before.textContent = "Outside";
    document.body.appendChild(before);
    before.focus();

    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={onDone}
        />,
      ),
    );
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    );

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.markSeen).toEqual([{ ids: ["b1", "b2", "b3", "b4"] }]);
    await waitFor(() => expect(document.activeElement).toBe(before));
    expect(onDone).toHaveBeenCalledTimes(1);
    before.remove();
  });

  it("Close on the last earning marks the rest seen once", async () => {
    const onDone = vi.fn();
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings({ moreIds: [] })}
          onDone={onDone}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(calls.markSeen).toEqual([{ ids: ["b1"] }, { ids: ["b2"] }]);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("an award has no pin or share, only See badges", () => {
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings({
            items: [
              {
                kind: "award",
                id: "a1",
                label: "Winner — RAG Hack 2026",
                earnedAt: "2026-06-02T12:00:00.000Z",
              },
            ],
            moreIds: [],
          })}
          onDone={() => undefined}
        />,
      ),
    );
    const dialog = screen.getByRole("dialog", { name: "You won an award" });
    expect(dialog).toHaveTextContent("Winner — RAG Hack 2026");
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Show on my profile" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "See badges" })).toBeVisible();
  });

  it("animates only behind motion-safe, so reduced motion shows it static and fully drawn", () => {
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings()}
          onDone={() => undefined}
        />,
      ),
    );
    const ring = screen.getByTestId("celebration-ring");
    expect(ring.getAttribute("class")).toBe("motion-safe:animate-emblem-ring");
    // No offset at rest: without the animation the ring is drawn in full.
    expect(ring.getAttribute("stroke-dashoffset")).toBeNull();
    expect(ring.getAttribute("stroke-dasharray")).toBe("100");
    const wrapper = screen.getByTestId("celebration-emblem");
    const animated = wrapper.querySelectorAll("[class*='animate']");
    for (const el of animated) {
      for (const cls of el.getAttribute("class")!.split(/\s+/)) {
        if (cls.includes("animate")) expect(cls).toMatch(/^motion-safe:/);
      }
    }
  });
});

describe("BadgeCelebrationDialog on a profile visitors cannot see", () => {
  it("offers no Share and says why, linking to profile settings", () => {
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings({
            profile: {
              pins: [],
              reach: { kind: "ownerOnly", reason: "private" },
            },
          })}
          onDone={() => undefined}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(
      screen.getByText(
        /Your profile is private, so this badge has no public page/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Profile settings" }),
    ).toHaveAttribute("href", "/dashboard/settings#profile");
    // Pinning still works: the owner sees their own showcase.
    expect(
      screen.getByRole("button", { name: "Show on my profile" }),
    ).toBeVisible();
  });

  it("says so without a settings link when staff keep the profile hidden", () => {
    render(
      wrap(
        <BadgeCelebrationDialog
          userId={USER}
          earnings={earnings({
            profile: {
              pins: [],
              reach: { kind: "ownerOnly", reason: "hiddenByStaff" },
            },
          })}
          onDone={() => undefined}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(
      screen.getByText(
        "Your profile is not public, so this badge has no public page.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Profile settings" })).toBeNull();
  });
});
