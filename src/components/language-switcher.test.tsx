import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import { LanguageSwitcher } from "./language-switcher";

const replace = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockClear();
  window.history.replaceState(null, "", "/en/events?past=1&page=2#results");
});

describe("language selector", () => {
  it("offers all three languages by their native names", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue(
      "en",
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["English", "Nederlands", "Français"]);
  });

  it("switches to French without losing filters, pagination or the fragment", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
    expect(replace).toHaveBeenCalledWith("/events?past=1&page=2#results", {
      locale: "fr",
    });
  });
});
