import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { StartupsJobsFilters } from "./startups-jobs-filters";
import { parseStartupJobsQuery } from "@/lib/investigations/startup-roles";

const replace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/jobs",
  useRouter: () => ({ replace }),
}));

const LABELS = {
  search: "Search roles…",
  company: "Filter by company",
  companyAll: "All companies",
  location: "Filter by location",
  locationAll: "All locations",
  locationRemote: "Remote",
  workType: "Filter by work type",
  workTypeAll: "All work types",
  sortRole: "Role A–Z",
  sortCompany: "Company A–Z",
  sortLocation: "Location A–Z",
  filters: "Filters",
  remoteToggle: "Remote",
  tryLabel: "Try:",
  results: "3 open roles",
  clear: "Clear",
};

function renderFilters(raw: Record<string, string> = {}) {
  return render(
    <StartupsJobsFilters
      query={parseStartupJobsQuery(raw)}
      locale="en"
      companies={[]}
      locations={[]}
      workTypes={[]}
      labels={LABELS}
    />,
  );
}

describe("StartupsJobsFilters search box", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows each keystroke at once and searches once typing pauses", () => {
    renderFilters();
    const box = screen.getByLabelText(LABELS.search);

    for (const value of ["e", "en", "eng", "engineer"]) {
      fireEvent.change(box, { target: { value } });
      expect(box).toHaveValue(value);
    }
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/jobs?q=engineer", {
      scroll: false,
    });
  });

  it("keeps a trailing space when the trimmed search comes back", () => {
    const { rerender } = renderFilters();
    const box = screen.getByLabelText(LABELS.search);
    fireEvent.change(box, { target: { value: "senior " } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender(
      <StartupsJobsFilters
        query={parseStartupJobsQuery({ q: "senior" })}
        locale="en"
        companies={[]}
        locations={[]}
        workTypes={[]}
        labels={LABELS}
      />,
    );
    expect(box).toHaveValue("senior ");
  });

  it("searches a quick-search chip at once and drops a pending search", () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText(LABELS.search), {
      target: { value: "des" },
    });
    // The chips hide while the box has text; clear it to bring them back.
    fireEvent.change(screen.getByLabelText(LABELS.search), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/jobs?q=Research", { scroll: false });
    expect(screen.getByLabelText(LABELS.search)).toHaveValue("Research");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
