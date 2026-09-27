import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import type { CommunityEventItem } from "./community-event-rows";

type Role = "owner" | "admin" | "moderator" | "member" | null;

const m = vi.hoisted(() => ({
  role: null as Role,
  signedIn: false,
  published: [] as unknown[],
  pending: [] as unknown[],
  mine: [] as unknown[],
  publishedState: { isLoading: false, isError: false },
  cancel: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  refetch: vi.fn(),
  confirm: vi.fn(),
  dialogProps: [] as Record<string, unknown>[],
}));

function query(data: unknown[], state = { isLoading: false, isError: false }) {
  return {
    data: state.isLoading || state.isError ? undefined : data,
    ...state,
    refetch: m.refetch,
  };
}

vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getMyCommunities: {
        useQuery: () => ({
          data: m.role
            ? [{ slug: "ai-amsterdam", status: "active", role: m.role }]
            : [],
        }),
      },
    },
    events: {
      getCommunityEvents: {
        useQuery: () => query(m.published, m.publishedState),
      },
      getPendingCommunityEvents: { useQuery: () => query(m.pending) },
      getMyEventSubmissions: { useQuery: () => query(m.mine) },
      cancelEvent: {
        useMutation: () => ({ mutate: m.cancel, isPending: false }),
      },
      approveEvent: {
        useMutation: () => ({ mutate: m.approve, isPending: false }),
      },
      rejectEvent: {
        useMutation: () => ({ mutate: m.reject, isPending: false }),
      },
    },
    useUtils: () => ({}),
  },
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: m.signedIn ? { user: { id: "user-1" } } : null,
    }),
  },
}));
vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => m.confirm,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/communities/event-form-dialog", () => ({
  EventFormDialog: (props: Record<string, unknown>) => {
    m.dialogProps.push(props);
    return null;
  },
}));
vi.mock("@/components/hackathon/create-hackathon-dialog", () => ({
  CreateHackathonDialog: () => <button type="button">Create hackathon</button>,
}));
vi.mock("@/components/events/pending-event-conflict-badge", () => ({
  PendingEventConflictBadge: ({ event }: { event: { id: number } }) => (
    <span data-testid="conflict-badge" data-event={event.id} />
  ),
}));

import { CommunityEvents } from "./community-events";

const NOW = new Date("2026-09-27T10:00:00.000Z");

function ev(
  id: number | string,
  overrides: Partial<CommunityEventItem> = {},
): CommunityEventItem {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    type: "meetup",
    date: "2026-10-01T00:00:00.000Z",
    startTime: "18:00",
    endTime: "21:00",
    timezone: "Europe/Amsterdam",
    location: "Pakhuis de Zwijger",
    format: "in-person",
    city: "Amsterdam",
    country: "Netherlands",
    status: "published",
    source: "native",
    lumaUrl: null,
    ...overrides,
  };
}

/** Realistic mix: date-only, online, hackathon, Luma, and two past events. */
const PUBLISHED_EVENTS = [
  ev(1, {
    title: "Agents Hackathon",
    type: "hackathon",
    date: "2026-10-10T00:00:00.000Z",
    startTime: "10:00",
    endTime: "18:00",
  }),
  ev(2, {
    title: "Prompting workshop",
    type: "workshop",
    format: "online",
    city: null,
    country: null,
    location: "Online",
    date: "2026-10-03",
    startTime: null,
    endTime: null,
  }),
  ev("luma-evt", {
    title: "Friday drinks",
    slug: null,
    source: "luma",
    lumaUrl: "https://lu.ma/drinks",
    city: null,
    country: null,
    location: "Keizersgracht 1, Amsterdam",
    date: "2026-10-16",
    startTime: "17:00",
    endTime: null,
  }),
  ev(3, {
    title: "RAG deep dive",
    type: "deep_dive",
    date: "2026-09-29T00:00:00.000Z",
    startTime: "19:00",
    endTime: "21:00",
  }),
  ev(4, { title: "Spring meetup", date: "2026-03-12T00:00:00.000Z" }),
  ev(5, { title: "Summer meetup", date: "2026-07-02T00:00:00.000Z" }),
];

function renderEvents(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <CommunityEvents slug="ai-amsterdam" now={NOW} />
    </NextIntlClientProvider>,
  );
}

function asRole(role: Role) {
  m.role = role;
  m.signedIn = role !== null;
}

function upcomingSection() {
  return screen.getByRole("region", { name: /upcoming events|aankomende/i });
}

function pastSection() {
  return screen.getByRole("region", { name: /past events|eerdere/i });
}

beforeEach(() => {
  asRole(null);
  m.published = PUBLISHED_EVENTS;
  m.pending = [];
  m.mine = [];
  m.publishedState = { isLoading: false, isError: false };
  m.cancel.mockReset();
  m.approve.mockReset();
  m.reject.mockReset();
  m.refetch.mockReset();
  m.confirm.mockReset();
  m.confirm.mockResolvedValue(true);
  m.dialogProps = [];
});

describe("CommunityEvents — the schedule everyone sees", () => {
  it("lists upcoming events soonest first, with NEXT UP on the true next", () => {
    renderEvents();
    const titles = within(upcomingSection())
      .getAllByRole("listitem")
      .map((li) => li.querySelector("span.font-semibold")?.textContent);
    expect(titles).toEqual([
      "RAG deep dive",
      "Prompting workshop",
      "Agents Hackathon",
      "Friday drinks",
    ]);
    const markers = screen.getAllByTestId("next-marker");
    expect(markers).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /^RAG deep dive/ }),
    ).toContainElement(markers[0] ?? null);
  });

  it("lists past events most recent first, in the compact form", () => {
    renderEvents();
    const links = within(pastSection()).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/events/event-5",
      "/events/event-4",
    ]);
    expect(links[0]?.querySelector("time")?.textContent).toBe("02 Jul");
    expect(links[0]?.textContent).toContain("Amsterdam, Netherlands · Meetup");
    expect(within(pastSection()).queryByTestId("next-marker")).toBeNull();
  });

  it("names each row by its visible words, with the event's own time", () => {
    renderEvents();
    expect(
      screen.getByRole("link", {
        name: "Prompting workshop, Online, 03 Oct, Sat, Workshop",
      }),
    ).toHaveAttribute("href", "/events/event-2");
    expect(
      screen.getByRole("link", {
        name: "Agents Hackathon, Amsterdam, Netherlands, 10 Oct, Sat, 10:00 CEST, Hackathon",
      }),
    ).toHaveAttribute("href", "/events/event-1");
    for (const link of within(upcomingSection()).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-label");
    }
  });

  it("opens a live Luma row on Luma in a new tab, and says so", () => {
    renderEvents();
    const luma = screen.getByRole("link", { name: /^Friday drinks/ });
    expect(luma).toHaveAttribute("href", "https://lu.ma/drinks");
    expect(luma).toHaveAttribute("target", "_blank");
    expect(luma).toHaveAttribute("rel", "noopener noreferrer");
    expect(luma.textContent).toContain("opens in a new tab");
  });

  it("has no old header row, English-only type codes or decorative plus", () => {
    renderEvents();
    const text = upcomingSection().textContent ?? "";
    expect(text).not.toMatch(/DEEP-DIVE|\/ DATE|\/ NAME|\+/);
    expect(text).toContain("Deep Dive");
  });

  it("spends orange only on the next marker for a guest", () => {
    renderEvents();
    const orange = Array.from(document.body.querySelectorAll("*")).filter(
      (el) =>
        /(^|\s)(text|bg|border)-primary(\/\d+)?(\s|$)/.test(
          el.getAttribute("class") ?? "",
        ),
    );
    expect(orange).toHaveLength(1);
    expect(orange[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("gives a guest no controls and no view switch", () => {
    renderEvents();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("speaks Dutch", () => {
    renderEvents("nl");
    expect(
      screen.getByRole("region", { name: nl.events.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: nl.events.pastSection }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Prompting workshop, Online, 03 okt, za, Workshop",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("next-marker").textContent).toContain(
      nl.events.nextUp,
    );
  });

  it("shows the empty note, with no sections, when there are no events", () => {
    m.published = [];
    renderEvents();
    expect(screen.getByText(en.events.noEvents)).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("says nothing is coming up, and still shows the past", () => {
    m.published = PUBLISHED_EVENTS.filter((e) => e.id === 4);
    renderEvents();
    expect(
      within(upcomingSection()).getByText(en.events.noEvents),
    ).toBeInTheDocument();
    expect(within(pastSection()).getAllByRole("link")).toHaveLength(1);
  });

  it("shows skeletons while loading and a retry on error", () => {
    m.publishedState = { isLoading: true, isError: false };
    const { unmount } = renderEvents();
    expect(screen.queryByRole("list")).toBeNull();
    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBe(3);
    unmount();

    m.publishedState = { isLoading: false, isError: true };
    renderEvents();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(m.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("CommunityEvents — organiser controls", () => {
  it("lets an owner edit, cancel and manage, wired to the right event", async () => {
    asRole("owner");
    renderEvents();

    const hackathonRow = screen
      .getByRole("link", { name: /^Agents Hackathon/ })
      .closest("li") as HTMLElement;
    expect(
      within(hackathonRow).getByRole("link", { name: "Manage" }),
    ).toHaveAttribute(
      "href",
      "/communities/ai-amsterdam/events/event-1/manage",
    );

    fireEvent.click(within(hackathonRow).getByRole("button", { name: "Edit" }));
    const last = m.dialogProps.at(-1);
    expect(last).toMatchObject({
      open: true,
      mode: "edit",
      eventId: 1,
      slug: "ai-amsterdam",
      isAdminOrOwner: true,
    });

    fireEvent.click(
      within(hackathonRow).getByRole("button", { name: "Cancel Event" }),
    );
    await waitFor(() =>
      expect(m.cancel).toHaveBeenCalledWith({
        eventId: 1,
        communitySlug: "ai-amsterdam",
      }),
    );
    expect(m.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true }),
    );
  });

  it("does not cancel when the organiser backs out", async () => {
    asRole("admin");
    m.confirm.mockResolvedValue(false);
    renderEvents();
    const row = screen
      .getByRole("link", { name: /^RAG deep dive/ })
      .closest("li") as HTMLElement;
    await act(async () => {
      fireEvent.click(
        within(row).getByRole("button", { name: "Cancel Event" }),
      );
    });
    expect(m.confirm).toHaveBeenCalledTimes(1);
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("keeps controls off live Luma rows, and on past events", () => {
    asRole("owner");
    renderEvents();
    const luma = screen
      .getByRole("link", { name: /^Friday drinks/ })
      .closest("li") as HTMLElement;
    expect(within(luma).queryByRole("button")).toBeNull();
    const past = within(pastSection()).getAllByRole("listitem")[0]!;
    expect(within(past).getByRole("button", { name: "Edit" })).toBeVisible();
  });

  it("keeps controls outside the row link", () => {
    asRole("owner");
    renderEvents();
    for (const button of screen.getAllByRole("button", { name: "Edit" })) {
      expect(button.closest("a")).toBeNull();
    }
  });

  it("opens the create dialog and offers a hackathon to owners", () => {
    asRole("owner");
    renderEvents();
    expect(
      screen.getByRole("button", { name: "Create hackathon" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: en.events.createEvent }),
    );
    expect(m.dialogProps.at(-1)).toMatchObject({
      open: true,
      mode: "create",
      eventId: undefined,
    });
  });

  it("lets a member submit, not create, and shows no organiser controls", () => {
    asRole("member");
    renderEvents();
    expect(
      screen.getByRole("button", { name: en.events.submitEvent }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create hackathon" })).toBe(
      null,
    );
    expect(
      screen.queryByRole("radio", { name: new RegExp(en.events.tabPending) }),
    ).toBeNull();
  });
});

describe("CommunityEvents — review queue and submissions", () => {
  const draft = {
    ...ev(21, {
      title: "Community night",
      status: "draft",
      date: "2026-11-05T00:00:00.000Z",
    }),
    slug: "event-21",
    audience: [{ slug: "builders", name: "Builders" }],
  };
  const draftHackathon = {
    ...ev(22, {
      title: "Winter hackathon",
      type: "hackathon",
      status: "draft",
      date: "2026-12-01T00:00:00.000Z",
    }),
    slug: "event-22",
    audience: [],
  };

  it("lets a moderator approve and reject, with a fresh conflict check", async () => {
    asRole("moderator");
    m.pending = [draft, draftHackathon];
    renderEvents();
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(en.events.tabPending) }),
    );

    const list = screen.getByRole("list");
    // Queue rows never link (#214); the badge sits outside any link.
    expect(within(list).queryAllByRole("link")).toHaveLength(0);
    expect(
      within(list)
        .getAllByTestId("conflict-badge")
        .map((b) => b.dataset.event),
    ).toEqual(["21", "22"]);
    // Moderators cannot open a hackathon's manage page.
    expect(within(list).queryByText("Manage")).toBeNull();

    const row = within(list).getAllByRole("listitem")[0]!;
    fireEvent.click(within(row).getByRole("button", { name: "Approve" }));
    expect(m.approve).toHaveBeenCalledWith({
      eventId: 21,
      communitySlug: "ai-amsterdam",
    });

    fireEvent.click(within(row).getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(m.reject).toHaveBeenCalledWith({
        eventId: 21,
        communitySlug: "ai-amsterdam",
      }),
    );
    expect(m.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: en.events.rejectEventConfirm }),
    );
  });

  it("gives an admin the manage page of a draft hackathon in the queue", () => {
    asRole("admin");
    m.pending = [draftHackathon];
    renderEvents();
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(en.events.tabPending) }),
    );
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute(
      "href",
      "/communities/ai-amsterdam/events/event-22/manage",
    );
  });

  it("shows the pending count on the queue switch", () => {
    asRole("moderator");
    m.pending = [draft, draftHackathon];
    renderEvents();
    expect(
      screen.getByRole("radio", { name: `${en.events.tabPending} 2` }),
    ).toBeInTheDocument();
  });

  it("shows a member where each submission stands, and lets them resubmit", () => {
    asRole("member");
    m.mine = [
      { ...draft, id: 31, title: "Waiting one" },
      { ...draft, id: 32, title: "Turned down", status: "rejected" },
    ];
    renderEvents();
    fireEvent.click(
      screen.getByRole("radio", { name: en.events.tabMySubmissions }),
    );
    const [waiting, rejected] = screen.getAllByRole("listitem");
    expect(waiting?.textContent).toContain(en.events.pendingApproval);
    expect(within(waiting!).queryByRole("button")).toBeNull();
    expect(rejected?.textContent).toContain(en.events.rejectedEditResubmit);
    // Neither has a public page yet, so neither links.
    expect(within(waiting!).queryByRole("link")).toBeNull();

    fireEvent.click(
      within(rejected!).getByRole("button", {
        name: en.events.editAndResubmit,
      }),
    );
    expect(m.dialogProps.at(-1)).toMatchObject({
      open: true,
      mode: "resubmit",
      eventId: 32,
    });
  });

  it("keeps the empty notes of the queue and the submissions", () => {
    asRole("moderator");
    renderEvents("nl");
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(nl.events.tabPending) }),
    );
    expect(
      screen.getByText(nl.events.noEventsPendingApproval),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("radio", { name: nl.events.tabMySubmissions }),
    );
    expect(screen.getByText(nl.events.noSubmissionsYet)).toBeInTheDocument();
  });
});

describe("CommunityEvents — translations and wiring", () => {
  const KEYS = [
    "title",
    "pastSection",
    "nextUp",
    "listsLabel",
    "editShort",
    "opensInNewTab",
    "cancelEvent",
    "approve",
    "reject",
    "editAndResubmit",
    "pendingApproval",
    "rejectedEditResubmit",
    "tabEvents",
    "tabPending",
    "tabMySubmissions",
    "noEvents",
    "noEventsPendingApproval",
    "noSubmissionsYet",
  ] as const;

  it.each([
    ["en", en],
    ["nl", nl],
  ] as const)("has every key it uses in %s", (locale, messages) => {
    for (const key of KEYS) {
      expect(messages.events[key], `${locale} events.${key}`).toBeTruthy();
    }
  });

  it("is what the community events route renders, with no own formatting", () => {
    const page = readFileSync(
      join(
        process.cwd(),
        "src/app/[locale]/communities/[slug]/events/page.tsx",
      ),
      "utf8",
    );
    expect(page).toContain("<CommunityEvents slug={slug} />");
    for (const file of [
      page,
      readFileSync(join(__dirname, "community-events.tsx"), "utf8"),
    ]) {
      expect(file).not.toMatch(/typeLabels|function formatDate|new Date\(/);
    }
  });
});
