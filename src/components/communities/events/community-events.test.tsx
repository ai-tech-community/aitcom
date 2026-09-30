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
  organizers: [] as unknown[],
  candidates: [] as unknown[],
  candidateQueries: [] as unknown[],
  setOrganizer: vi.fn(),
  publishedState: { isLoading: false, isError: false },
  cancel: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  refetch: vi.fn(),
  confirm: vi.fn(),
  mutationOptions: {} as Record<string, MutationOptions>,
  invalidate: {
    published: vi.fn(),
    pending: vi.fn(),
    mine: vi.fn(),
    organizers: vi.fn(),
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

interface MutationOptions {
  onSuccess?: () => void;
  onError?: () => void;
}

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
      communityEventOrganizers: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) =>
          query(opts.enabled ? m.organizers : []),
      },
      organizerCandidates: {
        useQuery: (input: unknown) => {
          m.candidateQueries.push(input);
          return query(m.candidates);
        },
      },
      setOrganizer: {
        useMutation: (options: MutationOptions) => {
          m.mutationOptions.setOrganizer = options;
          return { mutate: m.setOrganizer, isPending: false };
        },
      },
      cancelEvent: {
        useMutation: (options: MutationOptions) => {
          m.mutationOptions.cancel = options;
          return { mutate: m.cancel, isPending: false };
        },
      },
      approveEvent: {
        useMutation: (options: MutationOptions) => {
          m.mutationOptions.approve = options;
          return { mutate: m.approve, isPending: false };
        },
      },
      rejectEvent: {
        useMutation: (options: MutationOptions) => {
          m.mutationOptions.reject = options;
          return { mutate: m.reject, isPending: false };
        },
      },
    },
    useUtils: () => ({
      events: {
        getCommunityEvents: { invalidate: m.invalidate.published },
        getPendingCommunityEvents: { invalidate: m.invalidate.pending },
        getMyEventSubmissions: { invalidate: m.invalidate.mine },
        communityEventOrganizers: { invalidate: m.invalidate.organizers },
      },
    }),
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
vi.mock("sonner", () => ({
  toast: { success: m.toastSuccess, error: m.toastError },
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
  ev(6, {
    title: "Harbour hackathon",
    type: "hackathon",
    date: "2025-11-08T00:00:00.000Z",
  }),
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
  m.organizers = [];
  m.candidates = [];
  m.candidateQueries = [];
  m.setOrganizer.mockReset();
  m.publishedState = { isLoading: false, isError: false };
  m.cancel.mockReset();
  m.approve.mockReset();
  m.reject.mockReset();
  m.refetch.mockReset();
  m.confirm.mockReset();
  m.confirm.mockResolvedValue(true);
  m.mutationOptions = {};
  for (const fn of Object.values(m.invalidate)) fn.mockReset();
  m.toastSuccess.mockReset();
  m.toastError.mockReset();
});

/** Elements painted Signal Orange. */
function orangeElements() {
  return Array.from(document.body.querySelectorAll("*")).filter((el) =>
    /(^|\s)(text|bg|border)-primary(\/\d+)?(\s|$)/.test(
      el.getAttribute("class") ?? "",
    ),
  );
}

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
      "/events/event-6",
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
    const orange = orangeElements();
    expect(orange).toHaveLength(1);
    expect(orange[0]).toHaveAttribute("aria-hidden", "true");
    expect(orange[0]).toHaveAttribute("data-tone", "accent");
  });

  it.each(["member", "owner"] as const)(
    "keeps the marker ink when a %s has the orange button (One Voice)",
    (role) => {
      asRole(role);
      renderEvents();
      const marker = screen.getByTestId("next-marker");
      const star = marker.querySelector("[data-tone]");
      expect(star).toHaveAttribute("data-tone", "ink");
      expect(star).toHaveClass("text-foreground");
      // The primary action (create/submit, a link to the editor) is the one
      // orange thing on screen.
      const orange = orangeElements();
      expect(orange).toHaveLength(1);
      expect(orange[0]).toHaveAttribute(
        "href",
        "/communities/ai-amsterdam/events/new",
      );
    },
  );

  it("shows no status notes on the published list (published only)", () => {
    asRole("owner");
    renderEvents();
    expect(document.querySelector("[data-status]")).toBeNull();
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

    expect(
      within(hackathonRow).getByRole("link", { name: "Edit" }),
    ).toHaveAttribute("href", "/communities/ai-amsterdam/events/event-1/edit");

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

  it("keeps controls off live Luma rows", () => {
    asRole("owner");
    renderEvents();
    const luma = screen
      .getByRole("link", { name: /^Friday drinks/ })
      .closest("li") as HTMLElement;
    expect(within(luma).queryByRole("button")).toBeNull();
  });

  it("lets a past event be corrected, never cancelled", () => {
    asRole("owner");
    renderEvents();
    const [summer, , harbour] = within(pastSection()).getAllByRole("listitem");
    expect(within(summer!).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/communities/ai-amsterdam/events/event-5/edit",
    );
    expect(
      within(summer!).queryByRole("button", { name: "Cancel Event" }),
    ).toBeNull();
    expect(
      within(harbour!).getByRole("link", { name: "Manage" }),
    ).toHaveAttribute(
      "href",
      "/communities/ai-amsterdam/events/event-6/manage",
    );
    expect(
      within(pastSection()).queryByRole("button", { name: "Cancel Event" }),
    ).toBeNull();
  });

  it("tells the organiser when cancelling fails, in their language", () => {
    asRole("owner");
    renderEvents("nl");
    m.mutationOptions.cancel?.onError?.();
    expect(m.toastError).toHaveBeenCalledWith(nl.events.eventCancelError);
    m.mutationOptions.cancel?.onSuccess?.();
    expect(m.toastSuccess).toHaveBeenCalledWith(nl.events.eventCancelled);
    expect(m.invalidate.published).toHaveBeenCalledTimes(1);
  });

  it("keeps controls outside the row link", () => {
    asRole("owner");
    renderEvents();
    // Controls sit after the row's own link, never inside it.
    for (const edit of screen.getAllByRole("link", { name: "Edit" })) {
      expect(edit.parentElement?.closest("a")).toBeNull();
    }
  });

  it("links to the event editor and offers a hackathon to owners", () => {
    asRole("owner");
    renderEvents();
    expect(
      screen.getByRole("button", { name: "Create hackathon" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.events.createEvent }),
    ).toHaveAttribute("href", "/communities/ai-amsterdam/events/new");
  });

  it("offers a moderator submitting, since only owners and admins publish", () => {
    asRole("moderator");
    renderEvents();
    expect(
      screen.getByRole("link", { name: en.events.submitEvent }),
    ).toHaveAttribute("href", "/communities/ai-amsterdam/events/new");
  });

  it("lets a member submit, not create, and shows no organiser controls", () => {
    asRole("member");
    renderEvents();
    expect(
      screen.getByRole("link", { name: en.events.submitEvent }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
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

  it("refreshes the member's submissions after approve and reject", () => {
    asRole("moderator");
    renderEvents();
    m.mutationOptions.approve?.onSuccess?.();
    expect(m.invalidate.mine).toHaveBeenCalledTimes(1);
    expect(m.invalidate.pending).toHaveBeenCalledTimes(1);
    expect(m.invalidate.published).toHaveBeenCalledTimes(1);
    m.mutationOptions.reject?.onSuccess?.();
    expect(m.invalidate.mine).toHaveBeenCalledTimes(2);
    expect(m.invalidate.pending).toHaveBeenCalledTimes(2);
  });

  it("offers no Manage link for a queued hackathon without a slug", () => {
    asRole("admin");
    m.pending = [{ ...draftHackathon, slug: "" }];
    renderEvents();
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(en.events.tabPending) }),
    );
    expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
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
      {
        ...draft,
        id: 32,
        slug: "event-32",
        title: "Turned down",
        status: "rejected",
      },
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

    expect(
      within(rejected!).getByRole("link", {
        name: en.events.editAndResubmit,
      }),
    ).toHaveAttribute(
      "href",
      "/communities/ai-amsterdam/events/event-32/edit?resubmit=1",
    );
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

describe("CommunityEvents — event organizer", () => {
  function rowOf(title: RegExp) {
    return screen
      .getByRole("link", { name: title })
      .closest("li") as HTMLElement;
  }

  beforeEach(() => {
    m.organizers = [
      {
        eventId: 1,
        organizer: { userId: "ada", name: "Ada" },
        canChange: true,
      },
      { eventId: 2, organizer: null, canChange: true },
      {
        eventId: 3,
        organizer: { userId: "grace", name: "Grace" },
        canChange: false,
      },
    ];
    m.candidates = [
      {
        userId: "ada",
        name: "Ada",
        image: null,
        role: "member",
        isCurrent: true,
      },
      {
        userId: "linus",
        name: "Linus",
        image: null,
        role: "admin",
        isCurrent: false,
      },
    ];
  });

  it("names the organizer on each row an owner or admin sees", () => {
    asRole("admin");
    renderEvents();

    expect(
      within(rowOf(/^Agents Hackathon/)).getByRole("button", {
        name: "Organizer: Ada",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowOf(/^Prompting workshop/)).getByRole("button", {
        name: "Choose an organizer",
      }),
    ).toBeInTheDocument();
    // Not theirs to change: words, not a button.
    const deepDive = rowOf(/^RAG deep dive/);
    expect(within(deepDive).getByText("Organizer: Grace")).toBeInTheDocument();
    expect(
      within(deepDive).queryByRole("button", { name: /Organizer/ }),
    ).toBeNull();
  });

  it("links the viewer to the attendees of their own events only", () => {
    asRole("admin");
    m.organizers = [
      {
        eventId: 1,
        organizer: { userId: "user-1", name: "Me" },
        canChange: true,
      },
      { eventId: 2, organizer: null, canChange: false },
      {
        eventId: 3,
        organizer: { userId: "grace", name: "Grace" },
        canChange: false,
      },
    ];
    renderEvents();

    expect(
      within(rowOf(/^Agents Hackathon/)).getByRole("link", {
        name: "Attendees",
      }),
    ).toHaveAttribute(
      "href",
      "/communities/ai-amsterdam/events/event-1/attendees",
    );
    for (const title of [/^Prompting workshop/, /^RAG deep dive/]) {
      expect(
        within(rowOf(title)).queryByRole("link", { name: "Attendees" }),
      ).toBeNull();
    }
  });

  it("puts the organizer's controls on their own line, so the title keeps its width", () => {
    asRole("owner");
    renderEvents();
    const actions = rowOf(/^Agents Hackathon/).querySelector(
      "[data-slot='event-row-actions']",
    );
    expect(actions).toHaveAttribute("data-placement", "below");
    expect(actions).toHaveClass("order-last", "basis-full");
    expect(actions).not.toHaveClass("sm:shrink-0");
  });

  it("shows members and guests no organizer", () => {
    asRole("member");
    renderEvents();
    expect(screen.queryByText(/Organizer:/)).toBeNull();
  });

  it("hands the event to the chosen member", async () => {
    asRole("owner");
    renderEvents();

    fireEvent.click(
      within(rowOf(/^Agents Hackathon/)).getByRole("button", {
        name: "Organizer: Ada",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Who organizes this event?",
    });
    const confirmButton = within(dialog).getByRole("button", {
      name: "Make organizer",
    });
    // The current organizer is preselected; nothing to confirm yet.
    expect(within(dialog).getByRole("radio", { name: /Ada/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(confirmButton).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("radio", { name: /Linus/ }));
    expect(within(dialog).getByText("Admin")).toBeInTheDocument();
    fireEvent.click(confirmButton);

    expect(m.setOrganizer).toHaveBeenCalledWith({
      eventId: 1,
      userId: "linus",
    });
    expect(m.candidateQueries.at(-1)).toEqual({ eventId: 1, query: "" });

    act(() => m.mutationOptions.setOrganizer?.onSuccess?.());
    expect(m.invalidate.organizers).toHaveBeenCalled();
    expect(m.toastSuccess).toHaveBeenCalledWith("Organizer changed");
  });

  it("says so in their language when the change fails", async () => {
    asRole("owner");
    renderEvents("nl");

    fireEvent.click(
      within(rowOf(/^Agents Hackathon/)).getByRole("button", {
        name: "Organisator: Ada",
      }),
    );
    await screen.findByRole("dialog");
    act(() => m.mutationOptions.setOrganizer?.onError?.());
    expect(m.toastError).toHaveBeenCalledWith(
      "De organisator kon niet worden gewijzigd. Probeer het opnieuw.",
    );
  });

  it("teaches what to do when no member matches", async () => {
    asRole("owner");
    m.candidates = [];
    renderEvents();

    fireEvent.click(
      within(rowOf(/^Prompting workshop/)).getByRole("button", {
        name: "Choose an organizer",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("No members found")).toBeInTheDocument();
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
    "placeToBeAnnounced",
    "eventCancelError",
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
    "organizerLabel",
    "organizerNone",
    "organizerChoose",
    "organizerDialogTitle",
    "organizerDialogDescription",
    "organizerSearch",
    "organizerCurrent",
    "organizerCancel",
    "organizerConfirm",
    "organizerChanged",
    "organizerChangeError",
    "organizerLoadError",
    "organizerNoMatches",
    "organizerNoMatchesHint",
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
