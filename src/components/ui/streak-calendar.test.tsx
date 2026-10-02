import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StreakCalendar } from "./streak-calendar";

const MONTH = new Date(2026, 8, 1); // September 2026

describe("StreakCalendar", () => {
  it("renders read-only days as plain cells, with no tab stops", () => {
    render(
      <StreakCalendar
        streak={[{ periodStart: "2026-09-02", periodEnd: "2026-09-03" }]}
        view="month"
        month={MONTH}
        labels={{ calendar: "Streak calendar" }}
      />,
    );
    const grid = screen.getByRole("grid", { name: "Streak calendar" });
    expect(screen.getAllByRole("gridcell")).toHaveLength(30);
    expect(grid.querySelectorAll("button")).toHaveLength(0);
    expect(
      screen.getByRole("gridcell", { name: /September 2, streak active/ }),
    ).toBeInTheDocument();
  });

  it("renders clickable days as buttons when given a handler", () => {
    const onDayClick = vi.fn();
    render(
      <StreakCalendar
        streak={[]}
        view="month"
        month={new Date(2020, 0, 1)}
        onDayClick={onDayClick}
      />,
    );
    const days = screen.getAllByRole("gridcell");
    expect(days[0]!.tagName).toBe("BUTTON");
    fireEvent.click(days[0]!);
    expect(onDayClick).toHaveBeenCalledWith(new Date(2020, 0, 1), false);
  });
});
