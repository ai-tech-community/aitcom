import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: { useUtils: () => ({ collectors: { recognize: { fetch: h.fetch } } }) },
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: h.push }) }));

import { PasteBox } from "./paste-box";

const copy = en.collectors.workspace.paste;

function renderBox() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PasteBox />
    </NextIntlClientProvider>,
  );
}
const box = () => screen.getByRole("textbox", { name: copy.label });
const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: copy.submit }));

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockResolvedValue({
    ok: true,
    presetId: "custom-page",
    matched: false,
    prefill: { url: "https://example.com/jobs" },
  });
});

describe("PasteBox", () => {
  it("never takes focus by itself", () => {
    renderBox();
    expect(box()).not.toHaveFocus();
  });

  it("opens the Custom page with the address when nothing recognises it", async () => {
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com/jobs" } });
    submit();
    expect(h.fetch).toHaveBeenCalledWith({ address: "example.com/jobs" });
    await waitFor(() =>
      expect(h.push).toHaveBeenCalledWith(
        "/dashboard/collectors/new/custom-page?url=https%3A%2F%2Fexample.com%2Fjobs",
      ),
    );
  });

  it("marks the start page as recognised when a preset matched", async () => {
    h.fetch.mockResolvedValue({
      ok: true,
      presetId: "greenhouse-board",
      matched: true,
      prefill: { name: "acme" },
    });
    renderBox();
    fireEvent.change(box(), {
      target: { value: "https://boards.greenhouse.io/acme" },
    });
    submit();
    await waitFor(() =>
      expect(h.push).toHaveBeenCalledWith(
        "/dashboard/collectors/new/greenhouse-board?name=acme&recognised=1",
      ),
    );
  });

  it.each([
    "hello world",
    "javascript:alert(1)",
    "mailto:a@b.nl",
    "localhost:3000",
  ])("keeps %j in the box with a message, and asks nothing", (text) => {
    renderBox();
    fireEvent.change(box(), { target: { value: text } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.invalid);
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(box()).toHaveValue(text);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("starts as soon as a link is pasted into the empty box", async () => {
    renderBox();
    fireEvent.paste(box(), {
      clipboardData: { getData: () => "https://example.com/jobs" },
    });
    expect(h.fetch).toHaveBeenCalledWith({
      address: "https://example.com/jobs",
    });
    await waitFor(() => expect(h.push).toHaveBeenCalled());
  });

  it("says when the address can't be collected right now", async () => {
    h.fetch.mockResolvedValue({ ok: false, reason: "no_preset" });
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.noPreset);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("says the check failed when the request fails, keeping the text", async () => {
    h.fetch.mockRejectedValue(new Error("network"));
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(box()).toHaveValue("example.com");
  });

  it("asks once while a check is on its way", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    h.fetch.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    fireEvent.submit(box().closest("form")!);
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(screen.getByText(copy.checking)).toBeInTheDocument();
    await act(async () => resolve({ ok: false, reason: "no_preset" }));
  });

  it("keeps focus on the button while a check runs", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    h.fetch.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    const button = screen.getByRole("button", { name: copy.submit });
    button.focus();
    fireEvent.click(button);
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await act(async () => resolve({ ok: false, reason: "no_preset" }));
    expect(button).not.toHaveAttribute("aria-disabled");
  });

  it("announces the same problem again on a second try", () => {
    renderBox();
    fireEvent.change(box(), { target: { value: "hello world" } });
    submit();
    const first = screen.getByRole("alert");
    submit();
    const second = screen.getByRole("alert");
    expect(second).toHaveTextContent(copy.invalid);
    // A fresh node is a fresh announcement for screen readers.
    expect(second).not.toBe(first);
  });

  it("keeps one polite status line mounted, holding only the check", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    h.fetch.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBox();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent(copy.checking);
    await act(async () => resolve({ ok: false, reason: "no_preset" }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("");
  });

  it("keeps the help out of the live region, so it is not read again", () => {
    renderBox();
    expect(box()).toHaveAccessibleDescription(copy.help);
    const help = screen.getByText(copy.help);
    expect(help.closest('[role="status"], [aria-live]')).toBeNull();
    // A problem replaces the help as the description; clearing it brings
    // the help back without announcing it.
    fireEvent.change(box(), { target: { value: "hello world" } });
    submit();
    expect(box()).toHaveAccessibleDescription(copy.invalid);
    fireEvent.change(box(), { target: { value: "hello" } });
    expect(box()).toHaveAccessibleDescription(copy.help);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("does not start a check when a link is pasted into text already there", () => {
    renderBox();
    fireEvent.change(box(), { target: { value: "see " } });
    fireEvent.paste(box(), {
      clipboardData: { getData: () => "https://example.com/jobs" },
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });
});
