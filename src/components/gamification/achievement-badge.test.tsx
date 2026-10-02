import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

import { AchievementBadge } from "./achievement-badge";

function renderBadge(
  achievedAt: string | null,
  { locale = "en", rarity }: { locale?: "en" | "nl"; rarity?: number } = {},
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <div role="list">
        <AchievementBadge
          achievement={{
            id: "first_event",
            name: "First Event",
            trigger: "metric",
            achievedAt,
            rarity,
          }}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

describe("AchievementBadge", () => {
  it("shows an earned badge in the positive colour, a locked one muted", () => {
    const { container, unmount } = renderBadge("2026-01-01T00:00:00Z");
    const earnedIcon = container.querySelector("[aria-hidden='true'].relative");
    expect(earnedIcon).toHaveClass("text-success");
    expect(earnedIcon).not.toHaveClass("text-muted-foreground");
    unmount();

    const locked = renderBadge(null).container.querySelector(
      "[aria-hidden='true'].relative",
    );
    expect(locked).toHaveClass("text-muted-foreground");
    expect(locked).not.toHaveClass("text-success");
  });

  it("says its status in words, translated", () => {
    renderBadge("2026-01-01T00:00:00Z", { locale: "nl", rarity: 4 });
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("First Event, Verdiend");
    expect(item).toHaveTextContent("4% van de leden");
  });
});
