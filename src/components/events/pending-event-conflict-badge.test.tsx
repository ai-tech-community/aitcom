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
import type { RevealedWireConflict } from "@/server/events/conflicts/corpus";

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
    conflicts: RevealedWireConflict[];
    suggestions: [];
    checkedAudiences: [];
  };
  isLoading?: boolean;
}) {
  useQueryMock.mockReturnValue({
    data: overrides.data,
    isLoading: overrides.isLoading ?? false,
  });
}

describe("PendingEventConflictBadge", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("renders nothing while loading", () => {
    mockQuery({ isLoading: true, data: undefined });
    const { container } = render(
      <PendingEventConflictBadge event={baseEvent} />,
    );
    expect(container).toBeEmptyDOMElement();
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
    expect(screen.queryByText("Other Meetup")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Other Meetup")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Other Meetup")).not.toBeInTheDocument();
  });

  it("filters out a self-match conflict (moderator excludeEventId gate no-op edge case)", () => {
    mockQuery({
      data: {
        conflicts: [revealed({ id: baseEvent.id })],
        suggestions: [],
        checkedAudiences: [],
      },
    });
    const { container } = render(
      <PendingEventConflictBadge event={baseEvent} />,
    );
    expect(container).toBeEmptyDOMElement();
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
