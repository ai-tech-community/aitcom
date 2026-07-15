import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
  useLocale: () => "en-US",
}));

import {
  ConflictRow,
  EventConflictPanel,
  SlotSuggestionChips,
  type EventConflictPanelProps,
} from "./event-conflict-panel";
import type {
  RevealedWireConflict,
  TentativeWireConflict,
  WireConflict,
} from "@/server/events/conflicts/corpus";
import type { SlotSuggestion } from "@/server/events/conflicts/suggest";

const revealed = (
  overrides: Partial<RevealedWireConflict> = {},
): RevealedWireConflict => ({
  tentative: false,
  grade: "clash",
  audienceMatch: "direct",
  overlapMinutes: 30,
  id: 1,
  title: "AI Meetup Amsterdam",
  date: "2026-07-15",
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
  grade: "same-day",
  audienceMatch: "direct",
  date: "2026-07-16",
  sourceType: "hold",
  ...overrides,
});

const checkedAudiences = [
  { slug: "ai-engineers", name: "AI Engineers" },
  { slug: "founders", name: "Founders" },
];

function renderPanel(overrides: Partial<EventConflictPanelProps> = {}) {
  const onRetry = vi.fn();
  const props: EventConflictPanelProps = {
    state: "clear",
    conflicts: [],
    checkedAudiences,
    onRetry,
    ...overrides,
  };
  const utils = render(<EventConflictPanel {...props} />);
  return { ...utils, onRetry };
}

describe("EventConflictPanel", () => {
  it("renders nothing for idle state", () => {
    const { container } = renderPanel({ state: "idle" });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a skeleton with an sr-only status inside an aria-live region on a first check", () => {
    const { container } = renderPanel({ state: "checking" });
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    // A bare skeleton is silent to screen readers — the live region must
    // carry announceable text.
    expect(screen.getByText("conflictChecking")).toBeInTheDocument();
  });

  it("keeps the previous conflicts frame mounted (dimmed, relabeled) while re-checking", () => {
    const { container } = renderPanel({
      state: "checking",
      conflicts: [revealed()],
    });
    // No skeleton swap — the frame itself stays, so nothing below it jumps.
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText("AI Meetup Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("conflictRechecking")).toBeInTheDocument();
    expect(screen.queryByText("conflictSectionLabel")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("names the checked audiences on a clear result", () => {
    renderPanel({ state: "clear", checkedAudiences });
    expect(
      screen.getByText(
        `conflictClear:${JSON.stringify({ audiences: "AI Engineers, Founders" })}`,
      ),
    ).toBeInTheDocument();
  });

  it("names the catchment scope on a clear result when the dialog passed one", () => {
    renderPanel({ state: "clear", checkedAudiences, scope: "Amsterdam" });
    expect(
      screen.getByText(
        `conflictClearScoped:${JSON.stringify({ audiences: "AI Engineers, Founders", scope: "Amsterdam" })}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        `conflictClear:${JSON.stringify({ audiences: "AI Engineers, Founders" })}`,
      ),
    ).not.toBeInTheDocument();
  });

  it("falls back to the unscoped clear message when no scope is passed", () => {
    renderPanel({ state: "clear", checkedAudiences, scope: undefined });
    expect(
      screen.getByText(
        `conflictClear:${JSON.stringify({ audiences: "AI Engineers, Founders" })}`,
      ),
    ).toBeInTheDocument();
  });

  it("fires onRetry from the error state's retry button", () => {
    const { onRetry } = renderPanel({ state: "error" });
    expect(screen.getByText("conflictCheckFailed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "conflictRetry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders each conflict row's grade label, title, and source badge", () => {
    renderPanel({
      state: "conflicts",
      conflicts: [
        revealed({ sourceType: "import", sourceUrl: "https://lu.ma/x" }),
      ],
    });
    expect(screen.getByText("conflictGradeClash")).toBeInTheDocument();
    expect(screen.getByText("AI Meetup Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("conflictSourceImport")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: `conflictSourceLinkLabel:${JSON.stringify({ title: "AI Meetup Amsterdam" })}`,
      }),
    ).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders the tentative-hold row anonymized (lock + date, no title/link)", () => {
    renderPanel({ state: "conflicts", conflicts: [tentative()] });
    expect(
      screen.getByText(
        `conflictTentativeHold:${JSON.stringify({ date: "2026-07-16" })}`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("AI Meetup Amsterdam")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("reveals extra rows behind a real +N more expander button", () => {
    const conflicts: WireConflict[] = [
      revealed({ id: 1, title: "Row One" }),
      revealed({ id: 2, title: "Row Two" }),
      revealed({ id: 3, title: "Row Three" }),
      revealed({ id: 4, title: "Row Four" }),
    ];
    renderPanel({ state: "conflicts", conflicts });

    expect(screen.getByText("Row One")).toBeInTheDocument();
    expect(screen.getByText("Row Three")).toBeInTheDocument();
    expect(screen.queryByText("Row Four")).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", {
      name: `conflictShowMore:${JSON.stringify({ count: 1 })}`,
    });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    // aria-controls only makes sense once the controlled region exists in
    // the DOM — it's omitted entirely while collapsed rather than pointing
    // at an id nothing renders.
    expect(expandButton).not.toHaveAttribute("aria-controls");
    fireEvent.click(expandButton);

    expect(screen.getByText("Row Four")).toBeInTheDocument();
    const collapseButton = screen.getByRole("button", {
      name: "conflictShowFewer",
    });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseButton).toHaveAttribute("aria-controls");
    const controlledId = collapseButton.getAttribute("aria-controls")!;
    expect(document.getElementById(controlledId)).toBeInTheDocument();
  });

  it("marks the conflicts results region aria-live=polite", () => {
    const { container } = renderPanel({
      state: "conflicts",
      conflicts: [revealed()],
    });
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("shows a muted note when the audience match is only related", () => {
    renderPanel({
      state: "conflicts",
      conflicts: [revealed({ audienceMatch: "related" })],
    });
    expect(screen.getByText("conflictRelatedAudience")).toBeInTheDocument();
  });

  it("renders T3's children seam inside the conflicts frame", () => {
    renderPanel({
      state: "conflicts",
      conflicts: [revealed()],
      children: <div data-testid="slot-chips">chips</div>,
    });
    expect(screen.getByTestId("slot-chips")).toBeInTheDocument();
  });
});

describe("ConflictRow", () => {
  it("renders a revealed conflict's grade badge and title read-only", () => {
    render(<ConflictRow conflict={revealed({ grade: "same-evening" })} />);
    expect(screen.getByText("conflictGradeSameEvening")).toBeInTheDocument();
    expect(
      within(screen.getByRole("listitem")).getByText("AI Meetup Amsterdam"),
    ).toBeInTheDocument();
  });

  it("renders a tentative conflict with no identifying fields", () => {
    render(<ConflictRow conflict={tentative({ grade: "same-day" })} />);
    expect(screen.getByText(/conflictTentativeHold/)).toBeInTheDocument();
    expect(screen.queryByText("conflictGradeSameDay")).not.toBeInTheDocument();
  });
});

describe("SlotSuggestionChips", () => {
  const baseSuggestion: SlotSuggestion = {
    date: "2026-07-15",
    startTime: "18:00",
    endTime: "20:00",
    reasons: ["clear"],
    dayOffset: 0,
  };

  function renderChips(
    overrides: {
      suggestions?: SlotSuggestion[];
      onApply?: (slot: {
        date: string;
        startTime: string;
        endTime: string;
      }) => void;
    } = {},
  ) {
    const onApply = overrides.onApply ?? vi.fn();
    const utils = render(
      <SlotSuggestionChips
        suggestions={overrides.suggestions ?? [baseSuggestion]}
        checkedAudiences={checkedAudiences}
        timezone="Europe/Amsterdam"
        onApply={onApply}
      />,
    );
    return { ...utils, onApply };
  }

  it("renders nothing when there are no suggestions", () => {
    const { container } = renderChips({ suggestions: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chip with a mono locale-formatted date+time label", () => {
    renderChips();
    expect(screen.getByText("Wed, Jul 15 · 18:00–20:00")).toBeInTheDocument();
  });

  it("renders the clear reason annotation", () => {
    renderChips({ suggestions: [{ ...baseSuggestion, reasons: ["clear"] }] });
    expect(screen.getByText("slotReasonClear")).toBeInTheDocument();
  });

  it("renders the preferred-audience reason annotation, resolving the slug to a name", () => {
    renderChips({
      suggestions: [{ ...baseSuggestion, reasons: ["preferred:ai-engineers"] }],
    });
    expect(
      screen.getByText(
        `slotReasonPreferred:${JSON.stringify({ audience: "AI Engineers" })}`,
      ),
    ).toBeInTheDocument();
  });

  it("renders the original-time reason annotation", () => {
    renderChips({
      suggestions: [{ ...baseSuggestion, reasons: ["original-time"] }],
    });
    expect(screen.getByText("slotReasonOriginalTime")).toBeInTheDocument();
  });

  it("calls onApply with the exact {date,startTime,endTime} triple on click, dropping reasons/dayOffset", () => {
    const { onApply } = renderChips({
      suggestions: [
        {
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:30",
          reasons: ["clear", "preferred:founders"],
          dayOffset: 5,
        },
      ],
    });
    fireEvent.click(screen.getByRole("button"));
    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      date: "2026-07-20",
      startTime: "09:00",
      endTime: "10:30",
    });
  });

  it("renders 3-5 chips as real, individually clickable buttons", () => {
    const suggestions: SlotSuggestion[] = [
      { ...baseSuggestion, startTime: "18:00" },
      { ...baseSuggestion, startTime: "19:00" },
      { ...baseSuggestion, startTime: "20:00" },
    ];
    renderChips({ suggestions });
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

const slotChipsBaseProps = {
  suggestions: [
    {
      date: "2026-07-15",
      startTime: "18:00",
      endTime: "20:00",
      reasons: ["clear"],
      dayOffset: 0,
    } satisfies SlotSuggestion,
  ],
  checkedAudiences,
  timezone: "Europe/Amsterdam",
  onApply: vi.fn(),
};

describe("EventConflictPanel + SlotSuggestionChips composition", () => {
  it("does not render slot chips passed as children outside the conflicts state", () => {
    renderPanel({
      state: "clear",
      children: <SlotSuggestionChips {...slotChipsBaseProps} />,
    });
    expect(screen.queryByRole("button", { name: /·/ })).not.toBeInTheDocument();
  });

  it("renders slot chips passed as children inside the conflicts state", () => {
    renderPanel({
      state: "conflicts",
      conflicts: [revealed()],
      children: <SlotSuggestionChips {...slotChipsBaseProps} />,
    });
    const chip = screen.getByRole("button", { name: /·/ });
    expect(chip).toBeInTheDocument();
    expect(chip).toBeEnabled();
  });

  it("disables slot chips while re-checking so a stale slot can't be applied", () => {
    renderPanel({
      state: "checking",
      conflicts: [revealed()],
      children: <SlotSuggestionChips {...slotChipsBaseProps} />,
    });
    // Disabled via the panel's wrapping <fieldset disabled> — :disabled
    // matches through fieldset ancestry, so real browsers block activation
    // (spec: click() on a disabled form control does nothing) and the
    // Button's disabled:pointer-events-none styling kicks in. jsdom's
    // synthetic fireEvent.click bypasses both, so asserting the disabled
    // state is the faithful check here, not a synthetic click.
    expect(screen.getByRole("button", { name: /·/ })).toBeDisabled();
  });
});
