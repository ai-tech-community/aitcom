import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));

import {
  ConflictRow,
  EventConflictPanel,
  type EventConflictPanelProps,
} from "./event-conflict-panel";
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

  it("renders a skeleton inside an aria-live region while checking", () => {
    const { container } = renderPanel({ state: "checking" });
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
  });

  it("names the checked audiences on a clear result", () => {
    renderPanel({ state: "clear", checkedAudiences });
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
    expect(expandButton).toHaveAttribute("aria-controls");
    fireEvent.click(expandButton);

    expect(screen.getByText("Row Four")).toBeInTheDocument();
    const collapseButton = screen.getByRole("button", {
      name: "conflictShowFewer",
    });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
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
