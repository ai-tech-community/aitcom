import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventRecapNote } from "@/components/events/event-recap-note";
import { NvidiaGtcEnglishLinks } from "@/components/events/nvidia-gtc-english-links";
import { eventSchemaDates } from "@/lib/event-time";
import {
  AI_ENGINEER_NEW_YORK_OFFICIAL_URL,
  AI_ENGINEER_NEW_YORK_SLUG,
  NVIDIA_GTC_BERLIN_SLUG,
  aiEngineerNewYorkRecap,
  eventSeoDescription,
  eventSeoTitle,
  nvidiaNlEnglishLinks,
} from "@/lib/events/seo-event-pages";

const BANNED_META =
  /invented|not a summit ticket|does not register|live docs only|agent\.md and setup only/i;

describe("Dutch NVIDIA GTC English doors", () => {
  it("renders /en/join and the English register guide", () => {
    const { container } = render(<NvidiaGtcEnglishLinks />);
    expect(container.innerHTML).toContain('href="/en/join"');
    expect(container.innerHTML).toContain(
      'href="/en/guides/register-agent-mcp"',
    );
    expect(
      screen.getByRole("link", { name: "Word lid van AIT" }),
    ).toHaveAttribute("href", "/en/join");
    expect(
      screen.getByRole("link", { name: "Registreer een agent" }),
    ).toHaveAttribute("href", "/en/guides/register-agent-mcp");
  });

  it("is only for the Dutch NVIDIA page and leaves the title alone", () => {
    expect(nvidiaNlEnglishLinks(NVIDIA_GTC_BERLIN_SLUG, "nl")).not.toBeNull();
    expect(nvidiaNlEnglishLinks(NVIDIA_GTC_BERLIN_SLUG, "en")).toBeNull();
    expect(nvidiaNlEnglishLinks("other", "nl")).toBeNull();
    expect(
      eventSeoTitle(NVIDIA_GTC_BERLIN_SLUG, "nl", "NVIDIA GTC Berlin 2026"),
    ).toBe("NVIDIA GTC Berlin 2026");
    const page = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../app/[locale]/events/[slug]/page.tsx",
      ),
      "utf8",
    );
    expect(page).toContain("showNvidiaEnglishLinks");
    expect(page).toContain("<NvidiaGtcEnglishLinks />");
  });
});

describe("AI Engineer New York recap", () => {
  it("titles and describes the English page as a recap without a next date", () => {
    const recap = aiEngineerNewYorkRecap(AI_ENGINEER_NEW_YORK_SLUG, "en");
    expect(recap?.title).toBe("AI Engineer New York 2026 recap");
    expect(recap?.description).toMatch(/recap/i);
    expect(recap?.description.length).toBeLessThanOrEqual(160);
    expect(recap?.description).not.toMatch(BANNED_META);
    expect(recap?.description).not.toMatch(/2027|february|feb\b/i);
    expect(recap?.body).not.toMatch(/2027/);
    expect(eventSeoDescription(AI_ENGINEER_NEW_YORK_SLUG, "en")).toBe(
      recap?.description,
    );
    expect(eventSeoDescription("other-event", "en")).toBeNull();
  });

  it("uses a Dutch recap title and description", () => {
    const recap = aiEngineerNewYorkRecap(AI_ENGINEER_NEW_YORK_SLUG, "nl");
    expect(recap?.title).toMatch(/terugblik/i);
    expect(recap?.description.length).toBeLessThanOrEqual(160);
    expect(recap?.description).not.toMatch(BANNED_META);
    expect(recap?.description).not.toMatch(/2027/);
  });

  it("points the rendered note at the official site", () => {
    render(<EventRecapNote slug={AI_ENGINEER_NEW_YORK_SLUG} locale="en" />);
    expect(screen.getByRole("link", { name: "official site" })).toHaveAttribute(
      "href",
      AI_ENGINEER_NEW_YORK_OFFICIAL_URL,
    );
    expect(
      screen.getByText(/does not list a next edition/i),
    ).toBeInTheDocument();
  });

  it("keeps Event JSON-LD on 12–14 Oct 2026", () => {
    expect(
      eventSchemaDates({
        date: "2026-10-12",
        endDate: "2026-10-14",
        startTime: null,
        endTime: null,
        timezone: "America/New_York",
      }),
    ).toEqual({ startDate: "2026-10-12", endDate: "2026-10-14" });
    const page = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../app/[locale]/events/[slug]/page.tsx",
      ),
      "utf8",
    );
    expect(page).toContain("...schemaDates");
    expect(page).not.toMatch(/startDate:\s*["']2026/);
  });
});
