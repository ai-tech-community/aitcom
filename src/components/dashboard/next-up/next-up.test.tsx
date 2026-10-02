import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import type { NextUpItem } from "./next-up-row";

type Query = {
  data: { items: NextUpItem[]; partial: boolean } | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

const state = vi.hoisted(() => ({
  query: {} as Query,
  input: undefined as unknown,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    home: {
      nextUp: {
        useQuery: (input: unknown) => {
          state.input = input;
          return state.query;
        },
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

import { NextUp } from "./next-up";

const NOW = new Date("2026-10-02T10:00:00.000Z");

function loaded(items: NextUpItem[], partial = false): Query {
  return {
    data: { items, partial },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function renderNextUp(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
      now={NOW}
      timeZone="Europe/Amsterdam"
    >
      <NextUp />
    </NextIntlClientProvider>,
  );
}

const EVENT: NextUpItem = {
  kind: "event",
  key: "event:r1",
  urgency: { tier: "timeBound", at: "2026-10-04T16:00:00.000Z" },
  eventId: 1,
  slug: "ai-meetup",
  title: "AI Meetup",
  startsAt: "2026-10-04T16:00:00.000Z",
  registration: "waitlisted",
};

const CHALLENGE: NextUpItem = {
  kind: "challenge",
  key: "challenge:e1",
  urgency: { tier: "timeBound", at: "2026-10-09T10:00:00.000Z" },
  challengeId: 2,
  slug: "build-an-agent",
  title: "Build an agent",
  endsAt: "2026-10-09T10:00:00.000Z",
};

const OPEN_CHALLENGE: NextUpItem = {
  ...CHALLENGE,
  key: "challenge:e2",
  urgency: { tier: "ongoing" },
  endsAt: null,
};

const INVITE: NextUpItem = {
  kind: "invite",
  key: "invite:c1",
  urgency: { tier: "actionNeeded" },
  communityId: "c1",
  slug: "makers",
  name: "Makers",
};

const JOIN_REQUESTS: NextUpItem = {
  kind: "joinRequests",
  key: "joinRequests:c2",
  urgency: { tier: "actionNeeded" },
  communityId: "c2",
  slug: "builders",
  name: "Builders",
  count: 2,
};

const UNREAD: NextUpItem = {
  kind: "unread",
  key: "unread",
  urgency: { tier: "catchUp" },
  notifications: 3,
  messages: 1,
};

function rows() {
  return screen.getAllByRole("listitem");
}

function actionOf(row: HTMLElement) {
  return within(row).getByRole("link");
}

beforeEach(() => {
  state.query = loaded([]);
  state.input = undefined;
});

describe("NextUp", () => {
  it("asks for the member's next steps in the current locale", () => {
    renderNextUp("nl");
    expect(state.input).toEqual({ locale: "nl" });
  });

  it("renders every kind as a sentence with one link to where the member acts", () => {
    state.query = loaded([
      EVENT,
      CHALLENGE,
      INVITE,
      JOIN_REQUESTS,
      OPEN_CHALLENGE,
      UNREAD,
    ]);
    renderNextUp();

    expect(
      screen.getByRole("heading", { level: 2, name: /next up/i }),
    ).toBeInTheDocument();
    const list = rows();
    expect(list).toHaveLength(6);

    const expected: [string, string, string][] = [
      [
        "You're on the waitlist for AI Meetup",
        "View event",
        "/events/ai-meetup",
      ],
      [
        "Keep going on Build an agent",
        "Open challenge",
        "/challenges/build-an-agent",
      ],
      [
        "You're invited to join Makers",
        "View community",
        "/communities/makers",
      ],
      [
        "2 people want to join Builders",
        "Review requests",
        "/communities/builders/settings/members",
      ],
      [
        "Keep going on Build an agent",
        "Open challenge",
        "/challenges/build-an-agent",
      ],
      [
        "You have 3 unread notifications and 1 unread message",
        "See notifications",
        "/dashboard/notifications",
      ],
    ];
    expected.forEach(([sentence, action, href], i) => {
      const row = list[i]!;
      expect(row).toHaveTextContent(sentence);
      expect(within(row).getAllByRole("link")).toHaveLength(1);
      const link = actionOf(row);
      expect(link).toHaveTextContent(action);
      expect(link).toHaveAttribute("href", href);
      // The action names its row for screen readers.
      expect(link).toHaveAccessibleDescription(sentence);
    });
  });

  it("shows times as relative, machine-readable timestamps", () => {
    state.query = loaded([EVENT, CHALLENGE, OPEN_CHALLENGE]);
    renderNextUp();
    const [event, challenge, open] = rows();

    const start = within(event!).getByText("in 2 days");
    expect(start.tagName).toBe("TIME");
    expect(start).toHaveAttribute("datetime", "2026-10-04T16:00:00.000Z");
    expect(challenge).toHaveTextContent("Deadline in 1 week");
    expect(open).toHaveTextContent("No deadline");
  });

  it("spends the one orange only on the first row's action", () => {
    state.query = loaded([INVITE, JOIN_REQUESTS, UNREAD]);
    renderNextUp();
    const variants = rows().map((row) =>
      actionOf(row).getAttribute("data-variant"),
    );
    expect(variants).toEqual(["default", "outline", "outline"]);
  });

  it("sends unread messages to the inbox when no notification is unread", () => {
    state.query = loaded([{ ...UNREAD, notifications: 0, messages: 1 }]);
    renderNextUp();
    const [row] = rows();
    expect(row).toHaveTextContent("You have 1 unread message");
    expect(actionOf(row!)).toHaveAttribute("href", "/messages");
  });

  it("speaks Dutch with Dutch plurals", () => {
    state.query = loaded([{ ...JOIN_REQUESTS, count: 1 }, UNREAD]);
    renderNextUp("nl");
    const [requests, unread] = rows();
    expect(requests).toHaveTextContent("1 persoon wil lid worden van Builders");
    expect(unread).toHaveTextContent(
      "Je hebt 3 ongelezen meldingen en 1 ongelezen bericht",
    );
  });

  it("shows one warm line and one link when nothing is next", () => {
    state.query = loaded([]);
    renderNextUp();
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/events");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("keeps the rows and adds a quiet note when some sources failed", () => {
    state.query = loaded([INVITE], true);
    renderNextUp();
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      /could not load right now/i,
    );
  });

  it("does not claim the member is caught up when the only sources that had items failed", () => {
    state.query = loaded([], true);
    renderNextUp();
    expect(screen.queryByText(/you're all caught up/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /could not load right now/i,
    );
  });

  it("shows a skeleton while loading", () => {
    state.query = {
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    };
    const { container } = renderNextUp();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers a retry when the read fails", () => {
    const refetch = vi.fn();
    state.query = { data: undefined, isPending: false, isError: true, refetch };
    renderNextUp();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
