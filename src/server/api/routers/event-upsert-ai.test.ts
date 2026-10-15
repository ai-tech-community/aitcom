import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyEventAi } from "@/lib/events/event-ai";
import { buildEventPayloadData } from "./event-upsert-data";

describe("event submission stays open to any sector", () => {
  it("accepts a non-AI event with a real source link", async () => {
    const data = await buildEventPayloadData({} as never, {
      title: "Sunday pottery wheel",
      description: "Hand-building at the community studio.",
      type: "workshop",
      date: "2026-11-02",
      location: "Studio",
      sourceUrl: "https://studio.example/pottery",
    });

    expect(data.title).toBe("Sunday pottery wheel");
    expect(data.sourceUrl).toBe("https://studio.example/pottery");
    expect(
      classifyEventAi(
        "Sunday pottery wheel",
        "Hand-building at the community studio.",
      ),
    ).toBe(false);
  });

  it("does not invent a source link for a community's own event", async () => {
    const data = await buildEventPayloadData({} as never, {
      title: "Club social",
      type: "meetup",
      date: "2026-11-02",
      location: "Clubhouse",
      sourceUrl: "",
    });

    expect(data.sourceUrl ?? "").not.toMatch(/^https?:/);
  });

  it("stores the flag after create, submit, and resubmit without an AI gate", () => {
    const router = readFileSync(join(__dirname, "events.ts"), "utf8");
    const discovery = readFileSync(
      join(__dirname, "../../../app/api/cron/event-discovery-sync/route.ts"),
      "utf8",
    );
    expect(router).toContain("rememberEventAiFromEdit");
    expect(router).not.toMatch(/if\s*\(\s*!.*isAi/);
    expect(discovery).toContain("rememberEventAi");
    expect(discovery).not.toMatch(/if\s*\(\s*!.*isAi/);
  });
});
