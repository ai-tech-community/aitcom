import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import { EventMapPopup } from "./events-map-popup";
import type { MapEvent } from "./events-map-view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const EVENT: MapEvent = {
  id: 1,
  slug: "rag-deep-dive",
  title: "RAG deep-dive",
  date: "2026-10-05T00:00:00.000Z",
  location: "Pakhuis de Zwijger, Amsterdam",
  latitude: 52.37,
  longitude: 4.9,
  type: "deep_dive",
  aitFitScore: 8,
};

function renderPopup(locale: "en" | "nl") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
      timeZone="UTC"
    >
      <EventMapPopup event={EVENT} />
    </NextIntlClientProvider>,
  );
}

describe("EventMapPopup", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("shows the event's own day, padded, for a viewer west of UTC", () => {
    process.env.TZ = "America/Los_Angeles";
    const { container } = renderPopup("en");
    const time = container.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-10-05");
    expect(time).toHaveTextContent("05 Oct 2026");
    expect(container).toHaveTextContent("05 Oct 2026 · Deep Dive");
  });

  it("speaks Dutch on the Dutch site", () => {
    const { container } = renderPopup("nl");
    expect(container).toHaveTextContent("05 okt 2026 · Deep Dive");
    expect(screen.getByRole("link", { name: "RAG deep-dive" })).toHaveAttribute(
      "href",
      "/events/rag-deep-dive",
    );
  });
});
