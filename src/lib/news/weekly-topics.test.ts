import { describe, expect, it } from "vitest";

import { suggestWeeklyTopics, type WeeklyNewsItem } from "./weekly-topics";

const NOW = new Date("2026-10-14T12:00:00.000Z");

function item(
  id: string,
  title: string,
  at = "2026-10-13T08:00:00.000Z",
): WeeklyNewsItem {
  return { id, title, at: new Date(at) };
}

describe("suggestWeeklyTopics", () => {
  it("returns nothing when the week has no headlines", () => {
    expect(suggestWeeklyTopics([], new Set(), NOW)).toEqual([]);
    expect(
      suggestWeeklyTopics(
        [
          item(
            "old",
            "Open models reach the workplace",
            "2026-10-01T00:00:00.000Z",
          ),
        ],
        new Set(),
        NOW,
      ),
    ).toEqual([]);
  });

  it("uses the newest stored headline from a shared cluster", () => {
    const topics = suggestWeeklyTopics(
      [
        item(
          "a",
          "Open models reach European offices",
          "2026-10-12T08:00:00.000Z",
        ),
        item(
          "b",
          "Why open models reach more laptops",
          "2026-10-14T09:00:00.000Z",
        ),
        item(
          "c",
          "A note about something else entirely",
          "2026-10-14T10:00:00.000Z",
        ),
      ],
      new Set(),
      NOW,
    );
    const shared = topics.find((topic) => topic.articleIds.length > 1);
    expect(shared).toMatchObject({
      title: "Why open models reach more laptops",
      topicKey: "why-open-models-reach-more-laptops",
      articleIds: ["b", "a"],
    });
    expect(shared?.title).not.toBe("open models reach");
  });

  it("keeps the headline's own casing and punctuation", () => {
    const [topic] = suggestWeeklyTopics(
      [
        item("a", "EU AI Act enforcement begins", "2026-10-13T08:00:00.000Z"),
        item("b", "The EU AI Act, one year on", "2026-10-14T08:00:00.000Z"),
      ],
      new Set(),
      NOW,
    );
    expect(topic?.title).toBe("The EU AI Act, one year on");
    expect(topic?.articleIds).toEqual(["b", "a"]);
  });

  it("names clusters after real headlines instead of keyword fragments", () => {
    const topics = suggestWeeklyTopics(
      [
        item(
          "a",
          "Character AI launches a safety board",
          "2026-10-12T08:00:00.000Z",
        ),
        item(
          "b",
          "Character AI bans teen accounts overnight",
          "2026-10-14T09:00:00.000Z",
        ),
        item(
          "c",
          "Muse Wonder opens a studio in Amsterdam",
          "2026-10-13T08:00:00.000Z",
        ),
        item("d", "Muse Wonder raises a new round", "2026-10-14T07:00:00.000Z"),
      ],
      new Set(),
      NOW,
    );
    const titles = topics.map((topic) => topic.title);
    expect(titles).toContain("Character AI bans teen accounts overnight");
    expect(titles).toContain("Muse Wonder raises a new round");
    expect(titles).not.toContain("Character AI");
    expect(titles).not.toContain("Muse Wonder");
    expect(titles).not.toContain("Software-update");
    const character = topics.find((topic) =>
      topic.title.startsWith("Character AI"),
    );
    expect(character?.articleIds).toEqual(["b", "a"]);
  });

  it("skips a taken headline and uses another article from the same cluster", () => {
    const topics = suggestWeeklyTopics(
      [
        item("a", "Open models reach the workplace"),
        item("b", "Open models reach new labs"),
      ],
      new Set(["open-models-reach-the-workplace"]),
      NOW,
    );
    expect(topics.map((topic) => topic.title)).toContain(
      "Open models reach new labs",
    );
    expect(topics.map((topic) => topic.title)).not.toContain(
      "Open models reach the workplace",
    );
    expect(topics.map((topic) => topic.topicKey)).not.toContain(
      "open-models-reach",
    );
  });

  it("fills remaining slots with real headlines and stops at five", () => {
    const topics = suggestWeeklyTopics(
      [
        item(
          "1",
          "Alpha chips ship to new factories",
          "2026-10-14T01:00:00.000Z",
        ),
        item("2", "Beta labs open a second campus", "2026-10-14T02:00:00.000Z"),
        item(
          "3",
          "Gamma models pass a medical exam",
          "2026-10-14T03:00:00.000Z",
        ),
        item(
          "4",
          "Delta robots enter the warehouse",
          "2026-10-14T04:00:00.000Z",
        ),
        item(
          "5",
          "Epsilon rules change for startups",
          "2026-10-14T05:00:00.000Z",
        ),
        item(
          "6",
          "Zeta funds a local research hub",
          "2026-10-14T06:00:00.000Z",
        ),
      ],
      new Set(),
      NOW,
    );
    expect(topics).toHaveLength(5);
    expect(topics.map((topic) => topic.title)).toEqual([
      "Zeta funds a local research hub",
      "Epsilon rules change for startups",
      "Delta robots enter the warehouse",
      "Gamma models pass a medical exam",
      "Beta labs open a second campus",
    ]);
    for (const topic of topics) {
      expect(["1", "2", "3", "4", "5", "6"]).toContain(topic.articleIds[0]);
    }
  });

  it("keeps a business headline that is not about AI", () => {
    const topics = suggestWeeklyTopics(
      [
        item(
          "banks",
          "Banks raise mortgage rates again",
          "2026-10-14T08:00:00.000Z",
        ),
      ],
      new Set(),
      NOW,
    );
    expect(topics.map((topic) => topic.title)).toEqual([
      "Banks raise mortgage rates again",
    ]);
  });

  it("does not invent a topic from a headline that cannot be a slug", () => {
    expect(suggestWeeklyTopics([item("a", "!!!")], new Set(), NOW)).toEqual([]);
  });
});
