import { describe, expect, it } from "vitest";
import {
  toUpcomingEventInput,
  type UpcomingEventDoc,
} from "./to-upcoming-event-input";
import type { UpcomingEventInput } from "./upcoming-event-rows";

const DOC: UpcomingEventDoc = {
  id: 42,
  slug: "rag-deep-dive",
  title: "RAG in production",
  type: "deep_dive",
  format: "hybrid",
  date: "2026-11-12T00:00:00.000Z",
  startTime: "19:00",
  timezone: "Europe/Amsterdam",
  city: "Amsterdam",
  country: "Netherlands",
  location: "Pakhuis de Zwijger, Amsterdam",
  communityId: "c-nl",
};

const HOSTS = new Map([["c-nl", "AIT Community Netherlands"]]);

describe("toUpcomingEventInput", () => {
  it("copies every field the timetable reads", () => {
    const expected: Required<UpcomingEventInput> = {
      id: 42,
      slug: "rag-deep-dive",
      title: "RAG in production",
      type: "deep_dive",
      format: "hybrid",
      date: "2026-11-12T00:00:00.000Z",
      startTime: "19:00",
      timezone: "Europe/Amsterdam",
      city: "Amsterdam",
      country: "Netherlands",
      location: "Pakhuis de Zwijger, Amsterdam",
      host: "AIT Community Netherlands",
    };
    expect(toUpcomingEventInput(DOC, HOSTS)).toEqual(expected);
  });

  it("leaves no input field unset or undefined", () => {
    const input = toUpcomingEventInput(DOC, HOSTS);
    for (const [key, value] of Object.entries(input)) {
      expect(value, key).not.toBeUndefined();
    }
  });

  it("turns missing optional fields into null, not undefined", () => {
    const input = toUpcomingEventInput(
      {
        ...DOC,
        format: undefined,
        startTime: undefined,
        timezone: undefined,
        city: undefined,
        country: undefined,
        communityId: undefined,
      },
      HOSTS,
    );
    expect(input).toMatchObject({
      format: null,
      startTime: null,
      timezone: null,
      city: null,
      country: null,
      host: null,
    });
  });

  it("credits no host for an unknown or deleted community", () => {
    expect(
      toUpcomingEventInput({ ...DOC, communityId: "gone" }, HOSTS).host,
    ).toBeNull();
  });
});
