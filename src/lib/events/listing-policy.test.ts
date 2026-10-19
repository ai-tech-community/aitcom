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
  repairEventEncoding,
  stripListingPolicy,
} from "./listing-policy";

const WORLD_SUMMIT_DESCRIPTION = [
  "World Summit AI Amsterdam is positioned as a major global AI summit and a flagship AI gathering in the Netherlands.",
  "The official 2026 page lists dates of 7-8 October 2026 at Taets Art and Event Park in Amsterdam.",
  "For AIT Community, this is a strong regional event to track for local visibility, networking, and broader AI ecosystem awareness.",
].join("\n\n");

const WORLD_SUMMIT_META =
  "World Summit AI Amsterdam 2026. 07–08 Oct 2026. Taets Art & Event Park, Amsterdam.";

describe("stripListingPolicy", () => {
  it("drops curation and listing notes instead of keeping them", () => {
    expect(stripListingPolicy(WORLD_SUMMIT_DESCRIPTION)).toBe("");
    expect(hasListingPolicy(stripListingPolicy(WORLD_SUMMIT_DESCRIPTION))).toBe(
      false,
    );
  });

  it("removes source, listing-policy, and verification lines", () => {
    const text = [
      "A summit in Amsterdam.",
      "No invented member counts.",
      "source: https://worldsummit.ai/",
      "Listing policy: do not mention attendance.",
      "Verification note: dates checked against the official page.",
      "Joining AIT is community sign-up, not a summit ticket.",
    ].join("\n");
    expect(stripListingPolicy(text)).toBe("A summit in Amsterdam.");
    expect(hasListingPolicy(stripListingPolicy(text))).toBe(false);
  });

  it("drops fragments and keeps a capitalized factual clause", () => {
    expect(
      stripListingPolicy(
        "This Utrecht JUG meetup is directly relevant to AIT: agentic systems, autonomous security workflows, and memory in AI agents.",
      ),
    ).toBe("");
    expect(
      stripListingPolicy(
        "Strong thematic fit for AIT because it sits close to real-world AI systems and process automation.",
      ),
    ).toBe("");
    expect(
      stripListingPolicy(
        "This is exactly the kind of practitioner event AIT should surface: code, architecture, and real systems instead of generic hype.",
      ),
    ).toBe("");
    expect(
      stripListingPolicy(
        "The agenda covers transactional memory, knowledge graph RAG, and production trade-offs - exactly the kind of high-value technical topic we want.",
      ),
    ).toBe(
      "The agenda covers transactional memory, knowledge graph RAG, and production trade-offs",
    );
  });

  it("drops the editorial phrases that leaked into meta descriptions", () => {
    const editorial = [
      "The summit is positioned as a global gathering.",
      "Not the most technical event.",
      "It is a high-signal London event for builders.",
      "AI4ALL is a real local Dutch event focused on inclusion.",
      "It is highly relevant for members building production systems.",
      "Talks stay practical instead of generic hype.",
      "NeurIPS remains one of the most influential conferences.",
    ].join(" ");
    expect(stripListingPolicy(editorial)).toBe("");
  });

  it("repairs métier when the accent was dropped or replaced", () => {
    expect(repairEventEncoding("l'expertise mtier")).toBe("l'expertise métier");
    expect(repairEventEncoding(`l'expertise m${"\uFFFD"}tier`)).toBe(
      "l'expertise métier",
    );
    expect(stripListingPolicy("A workshop on expertise mtier in Paris.")).toBe(
      "A workshop on expertise métier in Paris.",
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
    expect(stripListingPolicy(meetup)).toBe(meetup);
    expect(
      stripListingPolicy(
        "CVPR is the top event for computer vision and a strong source of multimodal AI, perception, and advanced applied model research.",
      ),
    ).toBe("");
  });

  it("is idempotent", () => {
    const once = stripListingPolicy(WORLD_SUMMIT_DESCRIPTION);
    expect(stripListingPolicy(once)).toBe(once);
    const factual = stripListingPolicy(
      "A Paris meetup focused on agentic workflows and practical automation of expert work.",
    );
    expect(stripListingPolicy(factual)).toBe(factual);
  });

  it("strips policy paragraphs inside rich text and leaves clean rich text alone", () => {
    const original = plainTextToLexical(WORLD_SUMMIT_DESCRIPTION);
    const stripped = stripListingPolicyLexical(original);
    expect(lexicalToPlainText(stripped)).toBe("");
    const clean = plainTextToLexical("Hand-building at the community studio.");
    expect(stripListingPolicyLexical(clean)).toBe(clean);
  });
});

describe("event meta description", () => {
  it("is the name, date, and place when the description is curation", () => {
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
    expect(meta).toBe(WORLD_SUMMIT_META);
    expect(meta.length).toBeLessThanOrEqual(160);
    expect(meta).not.toMatch(
      /positioned as|official|lists dates|flagship|no invented|for ait|listing policy/i,
    );
  });

  it("adds one neutral topic sentence when it fits", () => {
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
    expect(meta.length).toBeLessThanOrEqual(160);
    expect(meta).not.toMatch(/amsterdam|attendees|rsvp/i);
  });

  it("omits a topic sentence that would push the description past 160 characters", () => {
    const meta = eventMetaDescription(
      {
        title: "AI Engineer World's Fair - San Francisco 2026",
        date: "2026-06-29",
        city: "San Francisco, USA",
        description: [
          "AI Engineer World's Fair is one of the strongest event matches for AIT Community's core audience: engineers and builders working on practical AI systems.",
          "The 2026 San Francisco edition is positioned as a large technical conference covering AI engineering, application building, infrastructure, and production workflows.",
          "This event is a strong fit for members interested in agents, tooling, orchestration, evaluation, and real-world deployment.",
          "A practical conference on AI engineering, application building, infrastructure, production workflows, evaluation, and deployment for working engineers.",
        ].join("\n\n"),
      },
      "en",
    );
    expect(meta).toBe(
      "AI Engineer World's Fair - San Francisco 2026. 29 Jun 2026. San Francisco, USA.",
    );
    expect(meta.length).toBeLessThanOrEqual(160);
    expect(meta).not.toMatch(
      /engineers and builders|positioned as|strong fit/i,
    );
  });

  it("repairs métier in the event name", () => {
    const meta = eventMetaDescription(
      {
        title: "Workflows agentiques : quand l'IA automatise l'expertise mtier",
        date: "2026-04-28",
        city: "Paris",
        location: "Paris, France",
        description:
          "A Paris meetup focused on agentic workflows and practical automation of expert work.\n\nStrong thematic fit for AIT because it sits close to real-world AI systems and process automation.",
      },
      "en",
    );
    expect(meta).toContain("métier");
    expect(meta).not.toMatch(/mtier|it sits close|thematic fit/i);
    expect(meta.length).toBeLessThanOrEqual(160);
    expect(
      meta.startsWith(
        "Workflows agentiques : quand l'IA automatise l'expertise métier. 28 Apr 2026. Paris, France.",
      ),
    ).toBe(true);
  });

  it("does not repeat a date or venue the facts already state", () => {
    const meta = eventMetaDescription(
      {
        title: "Web Summit 2026",
        date: "2026-11-09",
        endDate: "2026-11-12",
        city: "Lisbon",
        location: "MEO Arena, Lisbon",
        description: "Web Summit at MEO Arena in Lisbon, 9–12 Nov 2026.",
      },
      "en",
    );
    expect(meta).toBe("Web Summit 2026. 09–12 Nov 2026. MEO Arena, Lisbon.");
    expect(meta.length).toBeLessThanOrEqual(160);
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
  it("strips summary and description and repairs the title", () => {
    const data = {
      title: "Expertise mtier",
      summary: "A summit in Amsterdam. No invented member counts.",
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
    expect(next?.title).toBe("Expertise métier");
    expect(next?.summary).toBe("A summit in Amsterdam.");
    expect(lexicalToPlainText(next?.description)).toBe("Summit in Amsterdam.");
  });
});
