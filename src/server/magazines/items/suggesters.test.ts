import { describe, expect, it, vi } from "vitest";

import {
  AUTO_DRAFT_SOURCE_IDS,
  AUTO_DRAFT_SOURCES,
} from "@/lib/magazines/auto-draft";
import type { Magazine } from "@/payload-types";
import { suggestNewsItems } from "@/server/news/list";
import { suggestPublicStorylines } from "@/server/news/storylines";

import type { Deps } from "../deps";
import { magazineTopicsOf } from "../magazine-service";
import { suggestContextFor } from "./context";
import { ITEM_KINDS } from "./registry";
import { ITEM_SUGGESTERS } from "./suggesters";

vi.mock("@/server/db", () => ({ db: {} }));

describe("magazine suggestion sources", () => {
  it("every source has a suggester", () => {
    expect(Object.keys(ITEM_SUGGESTERS).sort()).toEqual(
      [...AUTO_DRAFT_SOURCE_IDS].sort(),
    );
  });

  it("every item kind has a source", () => {
    expect(
      [
        ...new Set(
          AUTO_DRAFT_SOURCE_IDS.map((s) => AUTO_DRAFT_SOURCES[s].kind),
        ),
      ].sort(),
    ).toEqual(Object.keys(ITEM_KINDS).sort());
  });

  it("does not query either news source without topics", async () => {
    const select = vi.fn();
    const database = { select } as unknown as Deps["db"];
    const input = {
      topics: [],
      since: new Date("2026-10-01"),
      until: new Date("2026-10-27"),
      limit: 3,
      exclude: [],
    };
    expect(await suggestNewsItems(input, database)).toEqual([]);
    expect(await suggestPublicStorylines(input, database)).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("keeps magazine topic text for reading and normalizes the suggestion context", () => {
    const magazine = {
      id: 42,
      topics: [
        { topic: " AI " },
        { topic: "" },
        { topic: null },
        { topic: "Robotics" },
        { topic: "ai" },
      ],
    } as Magazine;
    expect(magazineTopicsOf(magazine)).toEqual([" AI ", "Robotics", "ai"]);
    const now = new Date("2026-10-27T12:00:00Z");
    const deps = {} as Deps;
    const community = {
      id: "community",
      slug: "community",
      name: "Our community",
    };
    expect(
      suggestContextFor(deps, {
        magazine,
        community,
        viewerId: "acting-editor",
        locale: "nl",
        now,
      }),
    ).toEqual({
      deps,
      magazineId: 42,
      community,
      viewerId: "acting-editor",
      locale: "nl",
      now,
      topics: ["ai", "robotics"],
    });
  });
});
