import { describe, expect, it } from "vitest";

import { BUILDER_PUBLIC_EVENTS } from "./builder-public-events";
import { EVENT_TYPE_CORRECTIONS } from "./event-type-corrections";
import { inferEventType } from "./infer-event-type";

describe("inferEventType", () => {
  it("labels TechEx Amsterdam as a conference, not a meetup", () => {
    expect(
      inferEventType({
        title: "TechEx Amsterdam Hackathon",
        summary:
          "Official AI & Big Data Expo Europe hackathon with lablab.ai: build online from 16 Oct 2026, then finish on-site at RAI Amsterdam.",
      }),
    ).toBe("conference");
  });

  it("labels other conferences the seed used to call meetups", () => {
    expect(
      inferEventType({
        title: "PyTorch Conference North America 2026",
        summary: "PyTorch Foundation conference at San Jose Convention Center.",
      }),
    ).toBe("conference");
    expect(
      inferEventType({
        title: "NVIDIA GTC Berlin 2026",
        summary: "European GTC at Tempodrom and STATION-Berlin.",
      }),
    ).toBe("conference");
    expect(
      inferEventType({
        title: "AIxIA 2026",
        summary: "Franco-German AI conference in Strasbourg, 22 Oct 2026.",
      }),
    ).toBe("conference");
    expect(
      inferEventType({
        title: "Web Summit 2026",
        summary: "Web Summit at MEO Arena in Lisbon.",
      }),
    ).toBe("conference");
    expect(
      inferEventType({
        title: "LLMday London",
        summary: "Conference on large language models, agents and AI systems.",
      }),
    ).toBe("conference");
    expect(
      inferEventType({
        title: "NeurIPS 2026",
        summary: "A flagship AI research conference.",
      }),
    ).toBe("conference");
    expect(
      inferEventType({
        title: "AI Engineer New York 2026",
        summary: "Production AI engineering, finance and systems focus.",
      }),
    ).toBe("conference");
  });

  it("keeps real meetups, salons, and hack days", () => {
    expect(
      inferEventType({
        title: "Boston OpenClaw meetup",
        summary: "Personal-agent meetup at Microsoft NERD, Cambridge.",
      }),
    ).toBe("meetup");
    expect(
      inferEventType({
        title: "Agentic AI in the Wild: Open Source Agents in Production",
        summary:
          "Meetup on open-source agents in production, New York, Thu 22 Oct 2026.",
      }),
    ).toBe("meetup");
    expect(
      inferEventType({
        title: "AI Salon Amsterdam - World Summit AI Special",
        summary:
          "Amsterdam AI Salon special edition beside World Summit AI — interview, pitches, demos, and networking.",
      }),
    ).toBe("meetup");
    expect(
      inferEventType({
        title: "Hacktoberfest Hack Day Barcelona",
        summary: "One-day Hacktoberfest hack day on open-source AI.",
      }),
    ).toBe("hackathon");
    expect(
      inferEventType({
        title: "AGNTCon + MCPCon Europe",
        summary:
          "Linux Foundation flagship for the open agentic AI ecosystem — MCP, agent architectures, and production agent systems.",
      }),
    ).toBe("meetup");
    expect(
      inferEventType({
        title: "HumanX Amsterdam",
        summary:
          "Europe edition of HumanX — the AI stage for decision-makers and industry leaders at RAI Amsterdam.",
      }),
    ).toBe("meetup");
  });

  it("matches every correction the deploy migration writes", () => {
    for (const row of EVENT_TYPE_CORRECTIONS) {
      expect(inferEventType(row), row.slug).toBe(row.type);
    }
  });

  it("matches the type stored on each staff seed event", () => {
    for (const event of BUILDER_PUBLIC_EVENTS) {
      expect(
        inferEventType({ title: event.title, summary: event.summary.en }),
        event.slug,
      ).toBe(event.type);
    }
  });
});
