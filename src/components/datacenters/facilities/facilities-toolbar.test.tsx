import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const navigate = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => search.current,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

vi.mock("./facilities-navigation", () => ({
  useFacilitiesNavigation: () => ({ isPending: false, navigate }),
}));

import en from "../../../../messages/en.json";
import { FacilitiesToolbar } from "./facilities-toolbar";

function renderToolbar(
  query: string,
  focus = { operator: null, supplier: null },
) {
  search.current = new URLSearchParams(query);
  // A fresh element per render: re-using one lets React skip the update.
  const ui = () => (
    <NextIntlClientProvider locale="en" messages={en}>
      <FacilitiesToolbar
        statuses={[{ value: "operational", label: "Operational" }]}
        countries={[{ value: "NL", label: "Netherlands" }]}
        powerSources={[{ value: "gas", label: "Gas" }]}
        focus={focus}
      />
    </NextIntlClientProvider>
  );
  const view = render(ui());
  return {
    ...view,
    rerenderWith(next: string) {
      search.current = new URLSearchParams(next);
      view.rerender(ui());
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  navigate.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("<FacilitiesToolbar>", () => {
  it("searches once typing pauses, replacing history and returning to page 1", async () => {
    renderToolbar("page=3&sort=name");
    const box = screen.getByRole("searchbox", { name: "Search facilities" });

    fireEvent.change(box, { target: { value: "ams" } });
    fireEvent.change(box, { target: { value: "amster" } });
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("sort=name&q=amster", {
      replace: true,
    });
  });

  it("does not wipe characters typed while its own update is still arriving", async () => {
    const view = renderToolbar("");
    const box = screen.getByRole<HTMLInputElement>("searchbox");

    fireEvent.change(box, { target: { value: "ams" } });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.change(box, { target: { value: "amst" } });
    view.rerenderWith("q=ams"); // the echo of the first search lands late

    expect(box.value).toBe("amst");
  });

  it("follows the URL when something else changes the search (clear filters, back button)", async () => {
    const view = renderToolbar("q=ams");
    const box = screen.getByRole<HTMLInputElement>("searchbox");
    expect(box.value).toBe("ams");

    view.rerenderWith("");
    expect(box.value).toBe("");
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("toggles a checkbox filter into the URL", () => {
    renderToolbar("page=2");
    fireEvent.click(screen.getByRole("checkbox", { name: "AI-dedicated" }));
    expect(navigate).toHaveBeenCalledWith("ai=1", undefined);
  });

  it("shows focus chips with a way to remove them, and clears all filters", () => {
    renderToolbar("operator=microsoft&status=operational&size=50", {
      operator: { slug: "microsoft", canonicalName: "Microsoft" },
      supplier: null,
    } as never);

    expect(
      screen.getByRole("link", { name: "Microsoft" }).getAttribute("href"),
    ).toBe("/investigations/operators/microsoft");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove filter: Microsoft" }),
    );
    expect(navigate).toHaveBeenLastCalledWith(
      "status=operational&size=50",
      undefined,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(navigate).toHaveBeenLastCalledWith("size=50", undefined);
  });

  it("hides Clear filters when only sort or paging is set", () => {
    renderToolbar("sort=name&page=2");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});
