import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

import { XpProgress } from "./xp-progress";

describe("XpProgress", () => {
  it("names the next level and reads the XP toward it", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <XpProgress xp={753} />
      </NextIntlClientProvider>,
    );
    // 753 XP is level 4 (floor(753 / 200) + 1); 153 of 200 toward level 5.
    const bar = screen.getByRole("progressbar", {
      name: "XP towards level 5",
    });
    expect(bar).toHaveAttribute("aria-valuetext", "153 of 200 XP");
    expect(bar).toHaveAttribute("aria-valuenow", "77");
    expect(screen.getByText("753 XP")).toBeInTheDocument();
  });

  it("uses ink, not the accent colour", () => {
    const { container } = render(
      <NextIntlClientProvider locale="nl" messages={nl}>
        <XpProgress xp={10} />
      </NextIntlClientProvider>,
    );
    const indicator = container.querySelector(
      "[data-slot='progress-indicator']",
    );
    expect(indicator).toHaveClass("bg-foreground");
    expect(screen.getByRole("progressbar")).toHaveAccessibleName(
      "XP richting niveau 2",
    );
  });
});
