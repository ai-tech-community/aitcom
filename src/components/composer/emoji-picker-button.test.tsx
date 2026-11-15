import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
});
