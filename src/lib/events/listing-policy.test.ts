import { describe, expect, it } from "vitest";

import {
  plainTextToLexical,
  lexicalToPlainText,
} from "@/server/challenge-engine/lexical";
import {
  stripEventCopyBeforeChange,
  stripListingPolicyLexical,
} from "@/server/events/listing-policy-copy";
import {
  eventMetaDescription,
  eventWhereLabel,
  hasListingPolicy,
  stripListingPolicy,
} from "./listing-policy";

const WORLD_SUMMIT_DESCRIPTION = [
  "World Summit AI Amsterdam is positioned as a major global AI summit and a flagship AI gathering in the Netherlands.",
  "The official 2026 page lists dates of 7-8 October 2026 at Taets Art and Event Park in Amsterdam.",
  "For AIT Community, this is a strong regional event to track for local visibility, networking, and broader AI ecosystem awareness.",
].join("\n\n");

describe("stripListingPolicy", () => {
  it("drops internal listing notes and keeps what the event is", () => {
    expect(stripListingPolicy(WORLD_SUMMIT_DESCRIPTION)).toBe(
      [
        "World Summit AI Amsterdam is positioned as a major global AI summit and a flagship AI gathering in the Netherlands.",
        "The official 2026 page lists dates of 7-8 October 2026 at Taets Art and Event Park in Amsterdam.",
      ].join("\n\n"),
    );
  });

  it("removes source, listing-policy, and verification lines", () => {
    const text = [
      "Flagship summit in Amsterdam.",
      "No invented member counts.",
      "source: https://worldsummit.ai/",
      "Listing policy: do not mention attendance.",
      "Verification note: dates checked against the official page.",
      "Joining AIT is community sign-up, not a summit ticket.",
    ].join("\n");
    expect(stripListingPolicy(text)).toBe("Flagship summit in Amsterdam.");
    expect(hasListingPolicy(stripListingPolicy(text))).toBe(false);
  });

  it("keeps the factual tail of a listing sentence", () => {
    expect(
      stripListingPolicy(
        "This Utrecht JUG meetup is directly relevant to AIT: agentic systems, autonomous security workflows, and memory in AI agents.",
      ),
    ).toBe(
      "agentic systems, autonomous security workflows, and memory in AI agents.",
    );
    expect(
      stripListingPolicy(
        "The agenda covers transactional memory, knowledge graph RAG, and production trade-offs - exactly the kind of high-value technical topic we want.",
      ),
    ).toBe(
      "The agenda covers transactional memory, knowledge graph RAG, and production trade-offs",
    );
  });

  it("keeps a real mention of AIT when the event is for AIT", () => {
    const demo = "Demo event for AIT product videos. All paces welcome.";
    const training =
      "A live hour for anyone in the AIT community who is curious.";
    expect(stripListingPolicy(demo)).toBe(demo);
    expect(stripListingPolicy(training)).toBe(training);
  });

  it("keeps an official source description that is not an AIT note", () => {
    const meetup =
      "The official Meetup listing highlights workshops around agent building, RAG, MCP, and practical AI implementation.";
    const cvpr =
      "CVPR is the top event for computer vision and a strong source of multimodal AI, perception, and advanced applied model research.";
    expect(stripListingPolicy(meetup)).toBe(meetup);
    expect(stripListingPolicy(cvpr)).toBe(cvpr);
  });

  it("is idempotent", () => {
    const once = stripListingPolicy(WORLD_SUMMIT_DESCRIPTION);
    expect(stripListingPolicy(once)).toBe(once);
  });

  it("strips policy paragraphs inside rich text and leaves clean rich text alone", () => {
    const original = plainTextToLexical(WORLD_SUMMIT_DESCRIPTION);
    const stripped = stripListingPolicyLexical(original);
    expect(lexicalToPlainText(stripped)).toBe(
      stripListingPolicy(WORLD_SUMMIT_DESCRIPTION),
    );
    const clean = plainTextToLexical("Hand-building at the community studio.");
    expect(stripListingPolicyLexical(clean)).toBe(clean);
  });
});

describe("event meta description", () => {
  it("says what World Summit is, when, and where, without listing policy", () => {
    const meta = eventMetaDescription(
      {
        title: "World Summit AI Amsterdam 2026",
        date: "2026-10-07T12:00:00.000Z",
        endDate: "2026-10-08T12:00:00.000Z",
        city: "Amsterdam",
        location: "Taets Art & Event Park, Amsterdam",
        format: "in-person",
        summary:
          "A major global AI summit in Amsterdam bringing together researchers, founders, enterprises, and AI leaders.",
        description: WORLD_SUMMIT_DESCRIPTION,
      },
      "en",
    );
    expect(
      meta.startsWith("World Summit AI Amsterdam 2026. 07–08 Oct 2026."),
    ).toBe(true);
    expect(meta).toContain("Taets Art & Event Park, Amsterdam");
    expect(meta).toContain("flagship AI gathering in the Netherlands");
    expect(meta).not.toMatch(
      /no invented|member count|for ait|\/en\/join|listing policy/i,
    );
  });

  it("uses Online when that is the stored place and does not invent a city", () => {
    expect(
      eventWhereLabel({
        title: "Webinar",
        format: "online",
        location: "Online",
      }),
    ).toBe("Online");
    const meta = eventMetaDescription(
      {
        title: "Office hours",
        date: "2026-11-02",
        format: "online",
        location: "Online",
        description: "A live hour on the bots that run a company.",
      },
      "en",
    );
    expect(meta).toBe(
      "Office hours. 02 Nov 2026. Online. A live hour on the bots that run a company.",
    );
    expect(meta).not.toMatch(/amsterdam|attendees|rsvp/i);
  });

  it("cuts a long description on a sentence boundary", () => {
    const meta = eventMetaDescription(
      {
        title: "AI Engineer World's Fair - San Francisco 2026",
        date: "2026-06-29",
        city: "San Francisco, USA",
        description: [
          "AI Engineer World's Fair is one of the strongest event matches for AIT Community's core audience: engineers and builders working on practical AI systems.",
          "The 2026 San Francisco edition is positioned as a large technical conference covering AI engineering, application building, infrastructure, and production workflows.",
          "This event is a strong fit for members interested in agents, tooling, orchestration, evaluation, and real-world deployment.",
        ].join("\n\n"),
      },
      "en",
    );
    expect(meta.length).toBeLessThanOrEqual(320);
    expect(meta).toContain("production workflows.");
    expect(meta).not.toMatch(/this event is a\.?$/i);
    expect(meta).not.toMatch(/event matches for|ait community/i);
  });

  it("omits a date or place that was not stored", () => {
    expect(
      eventMetaDescription(
        {
          title: "Untitled gathering",
          description: "Builders compare notes.",
        },
        "en",
      ),
    ).toBe("Untitled gathering. Builders compare notes.");
  });
});

describe("stripEventCopyBeforeChange", () => {
  it("strips summary and description on insert and update", () => {
    const data = {
      title: "World Summit AI Amsterdam 2026",
      summary: "Flagship summit. No invented member counts.",
      description: plainTextToLexical(
        "Summit in Amsterdam.\n\nFor AIT Community, track it for local visibility.",
      ),
    };
    const next = stripEventCopyBeforeChange({
      data,
      operation: "create",
      req: {} as never,
      collection: {} as never,
      context: {},
    });
    expect(next?.summary).toBe("Flagship summit.");
    expect(lexicalToPlainText(next?.description)).toBe("Summit in Amsterdam.");
  });
});
