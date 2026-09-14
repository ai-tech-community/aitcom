import { describe, expect, it } from "vitest";

import type { AwesomePublicCard } from "./awesome-ai-oss";
import {
  AWESOME_STAR_STALE_DAYS,
  AWESOME_STAR_TOOLTIP,
  formatAwesomeStarCount,
  visibleAwesomeStarLine,
} from "./awesome-ai-oss-stars";

function card(overrides: Partial<AwesomePublicCard> = {}): AwesomePublicCard {
  return {
    id: "curated-ollama",
    name: "ollama/ollama",
    repoUrl: "https://github.com/ollama/ollama",
    repoHost: "github",
    category: "models",
    blurb: { en: "Local model run", nl: "Lokaal model draaien" },
    addedOn: "2023-07-01",
    source: "curated",
    starCount: 12_400,
    starsCheckedAt: "2026-09-14T08:00:00.000Z",
    sources: [],
    ...overrides,
  };
}

describe("formatAwesomeStarCount", () => {
  it("formats compact thousands the way Writing Bot shows them", () => {
    expect(formatAwesomeStarCount(12_400)).toBe("12.4k");
    expect(formatAwesomeStarCount(320)).toBe("320");
    expect(formatAwesomeStarCount(1_000)).toBe("1k");
    expect(formatAwesomeStarCount(1_234_000)).toBe("1.2m");
  });
});

describe("visibleAwesomeStarLine", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("renders live GitHub and GitLab copy when the fetch is fresh", () => {
    expect(visibleAwesomeStarLine(card(), now)).toBe("★ 12.4k on GitHub");
    expect(
      visibleAwesomeStarLine(
        card({
          repoHost: "gitlab",
          repoUrl: "https://gitlab.com/gitlab-org/gitlab",
          starCount: 320,
        }),
        now,
      ),
    ).toBe("★ 320 on GitLab");
  });

  it("omits missing, zero, and stale counts instead of inventing", () => {
    expect(visibleAwesomeStarLine(card({ starCount: null }), now)).toBeNull();
    expect(
      visibleAwesomeStarLine(card({ starCount: undefined }), now),
    ).toBeNull();
    expect(visibleAwesomeStarLine(card({ starCount: 0 }), now)).toBeNull();
    expect(
      visibleAwesomeStarLine(card({ starsCheckedAt: null }), now),
    ).toBeNull();
    expect(
      visibleAwesomeStarLine(
        card({ starsCheckedAt: "2026-09-01T08:00:00.000Z" }),
        now,
      ),
    ).toBeNull();
  });

  it("keeps the stale window at 7 days and the live-repo tooltip", () => {
    expect(AWESOME_STAR_STALE_DAYS).toBe(7);
    expect(AWESOME_STAR_TOOLTIP).toBe("Live from the repo · refreshed daily");
    expect(
      visibleAwesomeStarLine(
        card({ starsCheckedAt: "2026-09-07T12:00:00.000Z" }),
        now,
      ),
    ).toBe("★ 12.4k on GitHub");
    expect(
      visibleAwesomeStarLine(
        card({ starsCheckedAt: "2026-09-07T11:59:59.000Z" }),
        now,
      ),
    ).toBeNull();
  });
});
