import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { HomeStats, type HomeStatCounts } from "./home-stats";

const COUNTS: HomeStatCounts = {
  communities: 12,
  profiles: 32,
  events: 84,
  workshops: 21,
  hackathons: 9,
  sponsors: 1,
};

function renderIn(locale: "en" | "nl") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <HomeStats counts={COUNTS} />
    </NextIntlClientProvider>,
  );
}

function pairs() {
  return [...screen.getByTestId("home-stats").querySelectorAll("dt")].map(
    (dt) => [dt.textContent, dt.nextElementSibling?.textContent],
  );
}

describe("HomeStats", () => {
  it("labels each count in English, public profiles named honestly", () => {
    renderIn("en");
    expect(pairs()).toEqual([
      ["Communities:", "12"],
      ["Public profiles:", "32"],
      ["Events:", "84"],
      ["Workshops:", "21"],
      ["Hackathons:", "9"],
      ["Sponsors:", "1"],
    ]);
  });

  it("labels each count in Dutch on /nl", () => {
    renderIn("nl");
    expect(pairs().map(([label]) => label)).toEqual([
      "Communities:",
      "Openbare profielen:",
      "Evenementen:",
      "Workshops:",
      "Hackathons:",
      "Sponsors:",
    ]);
  });
});
