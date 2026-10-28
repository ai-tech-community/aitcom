import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { ShareActions } from "./share-actions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function actions(social = true, locale = "en") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "nl" ? nl : en}
    >
      <ShareActions title="AI & wij?" social={social} />
    </NextIntlClientProvider>
  );
}

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/en/magazines/weekly/issue-4?a=1&b=two");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
});
afterEach(() => vi.useRealTimers());

describe("ShareActions", () => {
  it("members-only keeps copy link only", () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn(),
    });
    render(actions(false));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("public shows X, LinkedIn and email links that open in a new tab", () => {
    render(actions());
    const url = encodeURIComponent(window.location.href);
    const links = [
      [
        "Share on X",
        `https://twitter.com/intent/tweet?text=AI%20%26%20wij%3F&url=${url}`,
      ],
      [
        "Share on LinkedIn",
        `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      ],
      ["Send by email", `mailto:?subject=AI%20%26%20wij%3F&body=${url}`],
    ];
    for (const [name, href] of links) {
      const link = screen.getByRole("link", {
        name: `${name} (opens in a new tab)`,
      });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.querySelector(".sr-only")).toHaveTextContent(
        "(opens in a new tab)",
      );
      expect(["outline", "ghost"]).toContain(link.dataset.variant);
    }
    expect(screen.queryByRole("button", { name: "Share…" })).toBeNull();
  });

  it("does not read the page URL or native share support during server render", () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn(),
    });
    const html = renderToString(actions());
    expect(html).not.toContain(encodeURIComponent(window.location.href));
    expect(html).not.toContain("Share…");
  });

  it("offers the native share sheet after mount and ignores cancellation", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    render(actions());
    fireEvent.click(screen.getByRole("button", { name: "Share…" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "AI & wij?",
        url: window.location.href,
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("copies the current link, announces success and resets its state", async () => {
    vi.useFakeTimers();
    const { unmount } = render(actions(false));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy link" })),
    );
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
    expect(toast.success).toHaveBeenCalledWith("Link copied");
    await act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a failure to open the native share sheet", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("Unavailable")),
    });
    render(actions());
    fireEvent.click(screen.getByRole("button", { name: "Share…" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Could not share the link. Try copying it.",
      ),
    );
  });

  it("reports a failed copy in Dutch", async () => {
    writeText.mockRejectedValue(new Error("Denied"));
    render(actions(false, "nl"));
    fireEvent.click(screen.getByRole("button", { name: "Link kopiëren" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "De link kon niet worden gekopieerd",
      ),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "De link kon niet worden gekopieerd",
    );
  });
});
