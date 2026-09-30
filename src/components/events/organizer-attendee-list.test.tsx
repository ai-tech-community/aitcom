// The organizer's attendee list presents what the server's read model
// returns (ADR-0038): no email or profile where the server withheld them,
// filters by status with counts, search, and the three data states.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

const m = vi.hoisted(() => ({
  state: { isLoading: false, isError: false } as {
    isLoading: boolean;
    isError: boolean;
  },
  data: null as unknown,
  refetch: vi.fn(),
  inputs: [] as unknown[],
}));

vi.mock("@/trpc/react", () => ({
  api: {
    events: {
      attendees: {
        useQuery: (input: unknown) => {
          m.inputs.push(input);
          return {
            ...m.state,
            data: m.state.isLoading || m.state.isError ? undefined : m.data,
            refetch: m.refetch,
          };
        },
      },
    },
  },
}));

import { OrganizerAttendeeList } from "./organizer-attendee-list";

const BASE = {
  firstName: null,
  lastName: null,
  detailsShared: true,
  registeredAt: new Date("2026-10-01T10:00:00Z"),
  waitlistPosition: null,
  paymentStatus: null,
  communityMemberSince: null,
  pastEventsAttended: 0,
  profile: null,
  answers: [] as {
    questionId: string;
    question: string;
    type: string;
    value: string | string[];
  }[],
};

const ROWS = [
  {
    ...BASE,
    registrationId: "r1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    status: "registered",
    communityMemberSince: new Date("2026-01-15T00:00:00Z"),
    pastEventsAttended: 2,
    answers: [
      {
        questionId: "hope",
        question: "What do you hope to learn?",
        type: "long_text",
        value: "Shipping agents",
      },
      {
        questionId: "topics",
        question: "Topics",
        type: "multi_choice",
        value: ["RAG", "Evals"],
      },
    ],
    profile: {
      company: "Analytical Engines",
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUrl: null,
      websiteUrl: null,
      experienceLevel: "advanced",
      skills: ["math", "poetry"],
      interests: [],
    },
  },
  {
    ...BASE,
    registrationId: "r2",
    displayName: "Grace Hopper",
    email: "grace@example.com",
    status: "waitlisted",
    waitlistPosition: 1,
  },
  {
    ...BASE,
    registrationId: "r3",
    displayName: "Old Registrant",
    email: null,
    detailsShared: false,
    status: "registered",
  },
  {
    ...BASE,
    registrationId: "r4",
    displayName: "Cancelled Carl",
    email: "carl@example.com",
    status: "cancelled",
  },
];

function data(rows = ROWS) {
  const counts = {
    registered: 0,
    waitlisted: 0,
    pending_payment: 0,
    attended: 0,
    cancelled: 0,
    payment_failed: 0,
  } as Record<string, number>;
  for (const r of rows) counts[r.status]!++;
  return {
    event: {
      id: 7,
      title: "Builders night",
      slug: "builders-night",
      date: "2026-11-02T00:00:00.000Z",
      startTime: "19:00",
      endTime: null,
      timezone: "Europe/Amsterdam",
      maxAttendees: 40,
      isPaid: false,
    },
    community: { slug: "builders", name: "Builders" },
    counts,
    rows,
  };
}

function renderList(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <OrganizerAttendeeList eventId={7} />
    </NextIntlClientProvider>,
  );
}

function names() {
  return screen
    .getAllByRole("listitem")
    .map((li) => li.querySelector("p")?.textContent);
}

beforeEach(() => {
  m.state = { isLoading: false, isError: false };
  m.data = data();
  m.refetch.mockReset();
  m.inputs = [];
});

describe("OrganizerAttendeeList", () => {
  it("asks for this event's attendees", () => {
    renderList();
    expect(m.inputs.at(-1)).toEqual({ eventId: 7 });
  });

  it("shows everyone still coming or waiting, with a summary", () => {
    renderList();
    expect(names()).toEqual(["Ada Lovelace", "Grace Hopper", "Old Registrant"]);
    expect(
      screen.getByText(
        /2 registered · 1 waitlisted · 0 checked in · 2 of 40 seats taken/,
      ),
    ).toBeInTheDocument();
  });

  it("links the email and shows a public profile", () => {
    renderList();
    const ada = screen.getAllByRole("listitem")[0]!;
    expect(
      within(ada).getByRole("link", { name: "ada@example.com" }),
    ).toHaveAttribute("href", "mailto:ada@example.com");
    expect(ada).toHaveTextContent("Analytical Engines");
    expect(ada).toHaveTextContent("math, poetry");
    expect(ada).toHaveTextContent("2 earlier events");
    expect(ada).toHaveTextContent(/Member since/);
  });

  it("says when a profile is private, and never invents an email", () => {
    renderList();
    const [, grace, old] = screen.getAllByRole("listitem");
    expect(grace).toHaveTextContent("Profile is private");
    expect(grace).toHaveTextContent("Waitlist #1");
    expect(old).toHaveTextContent("Registered before details were shared");
    expect(within(old!).queryByRole("link")).toBeNull();
    expect(old).not.toHaveTextContent("Profile is private");
  });

  it("filters by status, with counts on each view", () => {
    renderList();
    fireEvent.click(screen.getByRole("radio", { name: "Cancelled 1" }));
    expect(names()).toEqual(["Cancelled Carl"]);
    fireEvent.click(screen.getByRole("radio", { name: "Waitlist 1" }));
    expect(names()).toEqual(["Grace Hopper"]);
    // No payment view for a free event with no pending payments.
    expect(
      screen.queryByRole("radio", { name: /Awaiting payment/ }),
    ).toBeNull();
  });

  it("downloads the view on screen, in the page's language", () => {
    renderList("nl");
    const link = screen.getByRole("link", { name: "Download CSV" });
    expect(link).toHaveAttribute(
      "href",
      "/api/events/builders-night/attendees.csv?view=active&locale=nl",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Wachtlijst 1" }));
    expect(link).toHaveAttribute(
      "href",
      "/api/events/builders-night/attendees.csv?view=waitlisted&locale=nl",
    );
  });

  it("shows each person's answers, open, under their row", () => {
    renderList();
    const ada = screen.getAllByRole("listitem")[0]!;
    expect(within(ada).getByText("What do you hope to learn?")).toBeVisible();
    expect(within(ada).getByText("Shipping agents")).toBeInTheDocument();
    expect(within(ada).getByText("RAG, Evals")).toBeInTheDocument();
  });

  it("finds people by their answers", () => {
    renderList();
    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search name, email, company or answers",
      }),
      { target: { value: "evals" } },
    );
    expect(names()).toEqual(["Ada Lovelace"]);
  });

  it("searches name, email and company", () => {
    renderList();
    const search = screen.getByRole("searchbox", {
      name: "Search name, email, company or answers",
    });
    fireEvent.change(search, { target: { value: "engines" } });
    expect(names()).toEqual(["Ada Lovelace"]);
    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText("No one matches")).toBeInTheDocument();
  });

  it("teaches what to do when no one registered", () => {
    m.data = data([]);
    renderList();
    expect(screen.getByText("No one has registered yet")).toBeInTheDocument();
  });

  it("shows skeletons while loading and a retry on error", () => {
    m.state = { isLoading: true, isError: false };
    const { container, unmount } = renderList();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    unmount();

    m.state = { isLoading: false, isError: true };
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(m.refetch).toHaveBeenCalled();
  });

  it("speaks Dutch", () => {
    renderList("nl");
    expect(
      screen.getByText(/2 aangemeld · 1 op de wachtlijst/),
    ).toBeInTheDocument();
    expect(screen.getByText("Profiel is privé")).toBeInTheDocument();
  });
});
