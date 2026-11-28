import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import { BuilderNewKey } from "./builder-code";

vi.mock("@/i18n/navigation", () => ({ Link: "a" }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("keeps the current visibility label and clears copy feedback after two seconds", async () => {
  vi.useFakeTimers();
  const value = "ait_sk_sample";
  const writeText = vi.fn().mockResolvedValue(undefined);
  const restore = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  try {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <BuilderNewKey value={value} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(value)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(screen.getByText(value)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide key" }));
    expect(screen.getByRole("button", { name: "Show key" })).toBeVisible();
    expect(screen.queryByText(value)).toBeNull();

    const copy = screen.getByRole("button", { name: "Copy Agent API key" });
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith(value);
    const copied = within(copy).getByText("Copied");
    expect(copied).toHaveClass("opacity-100");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(copied).toHaveClass("opacity-0");
    expect(within(copy).getByText("Copy")).toHaveClass("opacity-100");
  } finally {
    if (restore) Object.defineProperty(navigator, "clipboard", restore);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
