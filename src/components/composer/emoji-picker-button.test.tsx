import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
  it("names its button from the composer strings", () => {
    render(
      <TooltipProvider>
        <EmojiPickerButton onPick={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "emoji" })).toBeInTheDocument();
  });
});
