import { describe, it, expect } from "vitest";
import { buildEventPayloadData } from "./event-upsert-data";

describe("buildEventPayloadData", () => {
  const base = {
    title: "AI Builders Meetup",
    type: "meetup" as const,
    date: "2026-06-12",
    location: "Amsterdam",
  };

  it("passes coverImage media id straight through", () => {
    const data = buildEventPayloadData({ ...base, coverImage: 42 });
    expect(data.coverImage).toBe(42);
  });

  it("leaves coverImage undefined when not provided", () => {
    const data = buildEventPayloadData(base);
    expect(data.coverImage).toBeUndefined();
  });
});
