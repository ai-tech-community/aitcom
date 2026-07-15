import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// pending-event-conflict-badge.tsx imports @/trpc/react for its live query —
// stub it the way topic-chips.test.tsx / member-stack.test.tsx do so the
// AppRouter's server-only import graph never loads under jsdom, and so the
// test can control + inspect the mocked useQuery call directly. `vi.hoisted`
// is required (not just a `mock`-prefixed const) because `vi.mock` itself is
// hoisted above regular module-level statements.
const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("@/trpc/react", () => ({
  api: {
    events: {
      checkConflicts: { useQuery: useQueryMock },
    },
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));

import { PendingEventConflictBadge } from "./pending-event-conflict-badge";
import type {
  RevealedWireConflict,
  TentativeWireConflict,
  WireConflict,
} from "@/server/events/conflicts/corpus";

const revealed = (
  overrides: Partial<RevealedWireConflict> = {},
): RevealedWireConflict => ({
  tentative: false,
  grade: "clash",
  audienceMatch: "direct",
  overlapMinutes: 30,
  id: 101,
  title: "Other Meetup",
  date: "2026-07-20",
  startTime: "18:00",
  endTime: "20:00",
  timezone: "Europe/Amsterdam",
  sourceType: "native",
  sourceUrl: null,
  ...overrides,
});

const tentative = (
  overrides: Partial<TentativeWireConflict> = {},
): TentativeWireConflict => ({
  tentative: true,
  grade: "clash",
  audienceMatch: "direct",
  date: "2026-07-20",
  sourceType: "hold",
  ...overrides,
});

const baseEvent = {
  id: 42,
  date: "2026-07-20",
  startTime: "18:00",
  endTime: "20:00",
  timezone: "Europe/Amsterdam",
  format: "online",
  city: null,
  audience: [{ slug: "ai-engineers", name: "AI Engineers" }],
};

function mockQuery(overrides: {
  data?: {
    conflicts: WireConflict[];
    suggestions: [];
    checkedAudiences: [];
  };
  isLoading?: boolean;
  isError?: boolean;
  refetch?: () => void;
}) {
  const refetch = overrides.refetch ?? vi.fn();
  useQueryMock.mockReturnValue({
    data: overrides.data,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
    refetch,
  });
  return { refetch };
}

describe("PendingEventConflictBadge", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("reserves the chip slot with a skeleton while loading (never a silent gap)", () => {
    mockQuery({ isLoading: true, data: undefined });
    const { container } = render(
      <PendingEventConflictBadge event={baseEvent} />,
    );
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a retryable 'check unavailable' chip on error instead of nothing", () => {
    const { refetch } = mockQuery({ isError: true, data: undefined });
    render(<PendingEventConflictBadge event={baseEvent} />);
    const chip = screen.getByRole("button", {
      name: "conflictBadgeCheckFailedRetry",
    });
    expect(chip).toHaveTextContent("conflictBadgeCheckFailed");
    fireEvent.click(chip);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("renders nothing when there are zero conflicts", () => {
    mockQuery({
      data: { conflicts: [], suggestions: [], checkedAudiences: [] },
    });
    const { container } = render(
      <PendingEventConflictBadge event={baseEvent} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the highest-severity grade and total count from the pre-sorted list", () => {
    mockQuery({
      data: {
        conflicts: [
          revealed({ id: 101, grade: "clash" }),
          revealed({ id: 102, grade: "same-day" }),
        ],
        suggestions: [],
        checkedAudiences: [],
      },
    });
    render(<PendingEventConflictBadge event={baseEvent} />);
    const trigger = screen.getByRole("button", { name: /conflictGradeClash/ });
    expect(trigger).toHaveTextContent("conflictGradeClash");
    expect(trigger).toHaveTextContent("2");
  });

  it("toggles a read-only expansion listing ConflictRows on click, closed by default", () => {
    mockQuery({
      data: { conflicts: [revealed()], suggestions: [], checkedAudiences: [] },
    });
    render(<PendingEventConflictBadge event={baseEvent} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // aria-controls is omitted while collapsed — nothing with that id exists
    // in the DOM yet, so pointing at it would be a dangling reference.
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(screen.queryByText("Other Meetup")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls");
    expect(screen.getByText("Other Meetup")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(screen.queryByText("Other Meetup")).not.toBeInTheDocument();
  });

  // Final-review item 1 (CRITICAL): the badge is mounted inside the pending
  // row's <Link>/<a> in page.tsx, wrapped in `<span className="contents"
  // onClick={(e) => e.preventDefault()}>` — the same house pattern every
  // other interactive cluster in `renderEventRow` uses to stop a click from
  // both toggling its own state *and* navigating (a draft's row 404s).
  // Reproduce that exact wrapper here and assert the click event actually
  // arrives at the anchor as defaultPrevented, and that the badge's own
  // toggle still fires (preventDefault must not also stop propagation).
  it("does not navigate when clicked inside a wrapping <a> using the house preventDefault pattern", () => {
    mockQuery({
      data: { conflicts: [revealed()], suggestions: [], checkedAudiences: [] },
    });
    render(
      // A raw <a> stands in for the row's `Link` (from `@/i18n/navigation`,
      // which renders an <a> under the hood) — this test is about native
      // click-bubbling/preventDefault semantics, identical either way, and
      // a raw tag keeps the test free of next-intl's routing context.
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a href="/events/some-slug">
        <span className="contents" onClick={(e) => e.preventDefault()}>
          <PendingEventConflictBadge event={baseEvent} />
        </span>
      </a>,
    );
    const trigger = screen.getByRole("button");
    // fireEvent.click's return value is the native dispatchEvent result:
    // false once something in the bubble path called preventDefault() on a
    // cancelable event — exactly what we're asserting the wrapping span did.
    const notPrevented = fireEvent.click(trigger);

    expect(notPrevented).toBe(false);
    // The badge's own toggle handler (attached to the trigger, a descendant
    // of the preventDefault span) still ran — preventDefault on the bubbled
    // event stops the anchor's navigation, not sibling/descendant handlers.
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("renders tentative-hold conflicts from OTHER drafts (anonymized rows count and expand)", () => {
    // A pending event never conflicts with itself here: excludeEventId is
    // honored server-side for every role that can view this queue (submitter
    // + owner/admin/moderator — see resolveExcludeEventId). So any tentative
    // row that arrives is genuinely ANOTHER unpublished draft, and must
    // render — the badge does no self-filtering of its own (it couldn't:
    // tentative rows carry no id on the wire).
    mockQuery({
      data: {
        conflicts: [tentative({ date: "2026-07-20" })],
        suggestions: [],
        checkedAudiences: [],
      },
    });
    render(<PendingEventConflictBadge event={baseEvent} />);
    const trigger = screen.getByRole("button", { name: /conflictGradeClash/ });
    expect(trigger).toHaveTextContent("1");

    fireEvent.click(trigger);
    expect(
      screen.getByText(
        `conflictTentativeHold:${JSON.stringify({ date: "2026-07-20" })}`,
      ),
    ).toBeInTheDocument();
  });

  it("never enables the query for rows without an audience", () => {
    mockQuery({ data: undefined });
    render(
      <PendingEventConflictBadge event={{ ...baseEvent, audience: [] }} />,
    );
    expect(useQueryMock).toHaveBeenCalledTimes(1);
    const [, options] = useQueryMock.mock.calls[0] as [
      unknown,
      { enabled: boolean },
    ];
    expect(options.enabled).toBe(false);
  });

  it("passes the row's own fields plus excludeEventId: event.id to checkConflicts", () => {
    mockQuery({ data: undefined });
    render(<PendingEventConflictBadge event={baseEvent} />);
    const [input, options] = useQueryMock.mock.calls[0] as [
      Record<string, unknown>,
      { enabled: boolean },
    ];
    expect(input).toMatchObject({
      date: "2026-07-20",
      startTime: "18:00",
      endTime: "20:00",
      timezone: "Europe/Amsterdam",
      format: "online",
      audience: ["ai-engineers"],
      excludeEventId: 42,
    });
    expect(options.enabled).toBe(true);
  });
});
