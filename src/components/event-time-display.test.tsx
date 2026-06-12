import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventTimeDisplay } from "./event-time-display";

const { mockUseTranslations } = vi.hoisted(() => ({
  mockUseTranslations: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

function mockViewerTimeZone(timeZone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone,
  });
}

describe("EventTimeDisplay", () => {
  beforeEach(() => {
    mockUseTranslations.mockReturnValue(
      (key: string, values?: Record<string, string>) =>
        values ? `${key}:${Object.values(values).join(",")}` : key,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the event-local time range with timezone abbreviation", () => {
    mockViewerTimeZone("Europe/Amsterdam");
    render(
      <EventTimeDisplay
        date="2026-07-15T00:00:00.000Z"
        startTime="18:00"
        endTime="21:00"
        timezone="Europe/Amsterdam"
      />,
    );
    expect(screen.getByText("18:00–21:00 CEST")).toBeInTheDocument();
  });

  it("does not show a viewer-local line when zones match", () => {
    mockViewerTimeZone("Europe/Amsterdam");
    render(
      <EventTimeDisplay
        date="2026-07-15T00:00:00.000Z"
        startTime="18:00"
        endTime="21:00"
        timezone="Europe/Amsterdam"
      />,
    );
    expect(screen.queryByText(/yourLocalTime/)).not.toBeInTheDocument();
  });

  it("shows the viewer-local conversion when the viewer is in a different zone", async () => {
    mockViewerTimeZone("America/New_York");
    render(
      <EventTimeDisplay
        date="2026-07-15T00:00:00.000Z"
        startTime="18:00"
        endTime="21:00"
        timezone="Europe/Amsterdam"
      />,
    );
    // 18:00–21:00 CEST = 12:00–15:00 EDT
    await waitFor(() => {
      expect(
        screen.getByText("yourLocalTime:12:00–15:00 EDT"),
      ).toBeInTheDocument();
    });
  });

  it("renders nothing without a start time", () => {
    mockViewerTimeZone("Europe/Amsterdam");
    const { container } = render(
      <EventTimeDisplay
        date="2026-07-15T00:00:00.000Z"
        startTime={null}
        endTime={null}
        timezone="Europe/Amsterdam"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a bare time range for legacy events without timezone", () => {
    mockViewerTimeZone("America/New_York");
    render(
      <EventTimeDisplay
        date="2026-07-15T00:00:00.000Z"
        startTime="18:00"
        endTime="21:00"
        timezone={null}
      />,
    );
    expect(screen.getByText("18:00–21:00")).toBeInTheDocument();
    expect(screen.queryByText(/yourLocalTime/)).not.toBeInTheDocument();
  });
});
