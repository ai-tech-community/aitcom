import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import emojiData from "emojibase-data/en/data.json";
import emojiMessages from "emojibase-data/en/messages.json";

import en from "../../../messages/en.json";

// Only the `composer` namespace exists, holding only the keys en.json has,
// so a string read from anywhere else fails the render.
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    if (namespace !== "composer") {
      throw new Error(`unexpected namespace "${namespace}"`);
    }
    return (key: string) => {
      if (!(key in en.composer)) {
        throw new Error(`unknown key "composer.${key}"`);
      }
      return key;
    };
  },
  useLocale: () => "en",
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { EmojiPickerButton } from "./emoji-picker-button";

/** Answers the picker's data requests the way /api/emojibase does. */
function serveEmojiData() {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (init?.method === "HEAD") return Promise.resolve(new Response(null));
    const body = url.endsWith("/messages.json") ? emojiMessages : emojiData;
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

/** Opens the panel and waits until its search box has focus. */
async function openPanel() {
  const trigger = screen.getByRole("button", { name: "emoji" });
  fireEvent.click(trigger);
  const search = await screen.findByRole("searchbox", { name: "emojiSearch" });
  await waitFor(() => expect(document.activeElement).toBe(search));
  return { trigger, search };
}

describe("EmojiPickerButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names its button from the composer strings", () => {
    render(
      <TooltipProvider>
        <EmojiPickerButton onPick={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "emoji" })).toBeInTheDocument();
  });

  // A composer is a <form>: Enter in the panel's search box must not
  // submit it. The panel renders outside the form, so it cannot.
  it("opens its panel outside the surrounding form", async () => {
    // The emoji data never arrives; the search box shows without it.
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    const { container } = render(
      <TooltipProvider>
        <form>
          <EmojiPickerButton onPick={vi.fn()} />
        </form>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "emoji" }));
    const search = await screen.findByRole("searchbox", {
      name: "emojiSearch",
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.contains(search)).toBe(false);
  });

  // WCAG 2.4.3: closing the panel without a pick must not drop focus to
  // the page; it goes back to the button that opened it.
  it("gives focus back to its button when the panel is closed with Escape", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    render(
      <TooltipProvider>
        <EmojiPickerButton onPick={vi.fn()} />
      </TooltipProvider>,
    );
    const { trigger, search } = await openPanel();

    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
    expect(document.activeElement).toBe(trigger);
  });

  // After a pick the composer puts the caret back in its text field
  // (applyEdit), so the closing panel must not pull focus to its button.
  // `onPick` here moves no focus, so only the panel decides where it goes.
  it("does not move focus to its button after a pick", async () => {
    serveEmojiData();
    const onPick = vi.fn();
    render(
      <TooltipProvider>
        <EmojiPickerButton onPick={onPick} />
      </TooltipProvider>,
    );
    const { trigger, search } = await openPanel();
    fireEvent.change(search, { target: { value: "grinning" } });
    // Wait for the emoji data to load.
    await waitFor(() =>
      expect(screen.queryByText("emojiLoading")).not.toBeInTheDocument(),
    );

    // Enter in the search box picks the highlighted emoji.
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onPick).toHaveBeenCalledWith("😀");
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
    expect(document.activeElement).not.toBe(trigger);
  });
});
