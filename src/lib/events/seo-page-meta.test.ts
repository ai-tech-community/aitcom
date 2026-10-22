import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  AGENT_READY_META,
  MCP_REGISTRY_META,
  REGISTER_AGENT_META,
} from "@/lib/seo-guides";
import {
  AWESOME_AI_OSS_INSIGHTS_META,
  AWESOME_AI_OSS_META,
} from "@/lib/investigations/awesome-ai-oss";
import {
  STARTUPS_INSIGHTS_META,
  STARTUPS_META,
} from "@/lib/investigations/startups";
import { eventMetaDescription } from "@/lib/events/listing-policy";
import {
  AI_ENGINEER_NEW_YORK_SLUG,
  eventSeoDescription,
} from "@/lib/events/seo-event-pages";

const BANNED =
  /invented|not a summit ticket|does not register|live docs only|agent\.md and setup only/i;

function descriptionLiterals(relativePath: string): string[] {
  const source = readFileSync(join(process.cwd(), relativePath), "utf8");
  return [...source.matchAll(/"([^"\n]{12,})"/g)]
    .map((match) => match[1] ?? "")
    .filter((line) =>
      /clone the open-source|open positions at listed|how the three descriptive flags/i.test(
        line,
      ),
    );
}

describe("meta descriptions already covered in this change", () => {
  it("keeps sourcing and listing notes out of the rendered descriptions", () => {
    const descriptions = [
      en.hubJoin.metaDescription,
      nl.hubJoin.metaDescription,
      REGISTER_AGENT_META,
      MCP_REGISTRY_META,
      AGENT_READY_META,
      AWESOME_AI_OSS_META,
      AWESOME_AI_OSS_INSIGHTS_META,
      STARTUPS_META,
      STARTUPS_INSIGHTS_META,
      en.investigationsStartups.shareOgDescription,
      en.investigationsStartups.shareOgDescriptionNoHiring,
      nl.investigationsStartups.shareOgDescription,
      nl.investigationsStartups.shareOgDescriptionNoHiring,
      eventSeoDescription(AI_ENGINEER_NEW_YORK_SLUG, "en"),
      eventSeoDescription(AI_ENGINEER_NEW_YORK_SLUG, "nl"),
      eventMetaDescription(
        {
          title: "World Summit AI Amsterdam 2026",
          date: "2026-10-07",
          endDate: "2026-10-08",
          city: "Amsterdam",
          location: "Taets Art & Event Park",
          format: "in-person",
          description:
            "No invented member counts. Joining AIT is community sign-up, not a summit ticket.",
        },
        "en",
      ),
      ...descriptionLiterals("src/app/[locale]/setup/page.tsx"),
      ...descriptionLiterals("src/app/[locale]/jobs/page.tsx"),
      ...descriptionLiterals(
        "src/app/[locale]/investigations/datacenters/method/page.tsx",
      ),
    ];

    expect(descriptions.filter(Boolean).length).toBeGreaterThanOrEqual(16);
    for (const description of descriptions) {
      expect(description ?? "", description ?? "").not.toMatch(BANNED);
      expect((description ?? "").length).toBeLessThanOrEqual(160);
    }
  });
});
