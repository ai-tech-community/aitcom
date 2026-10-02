import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import {
  DashboardSection,
  SectionBody,
  statusFromQueries,
  statusFromServerLoad,
  type SectionQuery,
} from "./dashboard-section";

function renderWithIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function query(overrides: Partial<SectionQuery> = {}): SectionQuery {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("statusFromServerLoad", () => {
  const retry = vi.fn();

  it("shows a failed server load as an error that retries", () => {
    const status = statusFromServerLoad({ failed: true, retry });
    expect(status).toEqual({ kind: "error", retry });
  });

  it("is loading while a retry or a new view is on its way", () => {
    expect(
      statusFromServerLoad({ failed: true, refreshing: true, retry }),
    ).toEqual({ kind: "loading" });
  });

  it("is empty or ready once loaded", () => {
    expect(
      statusFromServerLoad({ failed: false, isEmpty: true, retry }),
    ).toEqual({ kind: "empty" });
    expect(statusFromServerLoad({ failed: false, retry })).toEqual({
      kind: "ready",
    });
  });
});

describe("statusFromQueries", () => {
  it("is loading while a query has no data yet", () => {
    expect(
      statusFromQueries([query({ data: 1 }), query({ isPending: true })]),
    ).toEqual({ kind: "loading" });
  });

  it("reports an error over a sibling that is still loading", () => {
    const status = statusFromQueries([
      query({ isPending: true }),
      query({ isError: true }),
    ]);
    expect(status.kind).toBe("error");
  });

  it("retries only the failed queries", () => {
    const ok = query({ data: 1 });
    const failed = query({ isError: true });
    const status = statusFromQueries([ok, failed]);
    if (status.kind !== "error") throw new Error("expected error");
    status.retry?.();
    expect(failed.refetch).toHaveBeenCalledTimes(1);
    expect(ok.refetch).not.toHaveBeenCalled();
  });

  it("keeps showing data when only a background refetch failed", () => {
    expect(statusFromQueries(query({ data: [1], isError: true }))).toEqual({
      kind: "ready",
    });
  });

  it("is empty or ready once loaded, as the caller decides", () => {
    expect(statusFromQueries(query({ data: [] }), { isEmpty: true })).toEqual({
      kind: "empty",
    });
    expect(statusFromQueries(query({ data: [1] }))).toEqual({ kind: "ready" });
  });
});

describe("DashboardSection", () => {
  it("renders an h2 kicker labelling the section, plus the action slot", () => {
    renderWithIntl(
      <DashboardSection
        title="Next up"
        action={<button type="button">All</button>}
      >
        <p>content</p>
      </DashboardSection>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: /next up/i });
    expect(screen.getByRole("region", { name: /next up/i })).toContainElement(
      heading,
    );
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows a skeleton while loading, not the content", () => {
    const { container } = renderWithIntl(
      <DashboardSection title="You" status={{ kind: "loading" }}>
        <p>content</p>
      </DashboardSection>,
    );
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("uses a custom skeleton when given", () => {
    renderWithIntl(
      <DashboardSection
        title="You"
        status={{ kind: "loading" }}
        skeleton={<div data-testid="custom-skeleton" />}
      />,
    );
    expect(screen.getByTestId("custom-skeleton")).toBeInTheDocument();
  });

  it("shows an error with a working retry", () => {
    const retry = vi.fn();
    renderWithIntl(
      <DashboardSection title="You" status={{ kind: "error", retry }}>
        <p>content</p>
      </DashboardSection>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(en.common.errorTitle);
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("hides an optional section that failed, heading included", () => {
    const { container } = renderWithIntl(
      <DashboardSection title="People" optional status={{ kind: "error" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the empty content when empty", () => {
    renderWithIntl(
      <DashboardSection
        title="Next up"
        status={{ kind: "empty" }}
        empty={<p>Nothing planned yet</p>}
      >
        <p>content</p>
      </DashboardSection>,
    );
    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders nothing when empty and no empty content is given", () => {
    const { container } = renderWithIntl(
      <DashboardSection title="People" status={{ kind: "empty" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("frames the card variant and leaves the plain variant unboxed", () => {
    const { container, rerender } = renderWithIntl(
      <DashboardSection title="You" variant="card" />,
    );
    expect(container.querySelector("section")).toHaveClass(
      "rounded-xl",
      "border",
    );
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <DashboardSection title="You" />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector("section")).not.toHaveClass("border");
  });
});

describe("DashboardSection appearWhenReady", () => {
  it("renders nothing while loading, then the section once it has content", () => {
    const { container, rerender } = renderWithIntl(
      <DashboardSection
        title="Introductions"
        status={{ kind: "loading" }}
        appearWhenReady
      >
        <p>One to answer</p>
      </DashboardSection>,
    );
    expect(container.innerHTML).toBe("");

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <DashboardSection
          title="Introductions"
          status={{ kind: "ready" }}
          appearWhenReady
        >
          <p>One to answer</p>
        </DashboardSection>
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /introductions/i }),
    ).toBeTruthy();
    expect(screen.getByText("One to answer")).toBeTruthy();
  });
});

describe("SectionBody", () => {
  it("renders the content only when ready", () => {
    renderWithIntl(
      <SectionBody status={{ kind: "ready" }}>
        <p>chart</p>
      </SectionBody>,
    );
    expect(screen.getByText("chart")).toBeInTheDocument();
  });
});
