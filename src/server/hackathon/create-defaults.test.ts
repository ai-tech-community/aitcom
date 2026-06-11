import { describe, it, expect } from "vitest";
import { deriveSlug, buildHackathonChallengeData } from "./create-defaults";

describe("deriveSlug", () => {
  it("slugifies and appends the uniqueness suffix", () => {
    expect(deriveSlug("My Cool Hackathon", "abc123")).toBe(
      "my-cool-hackathon-abc123",
    );
  });
  it("strips punctuation and collapses spaces", () => {
    expect(deriveSlug("API & SDK Jam!", "x")).toBe("api-sdk-jam-x");
  });
});

describe("buildHackathonChallengeData", () => {
  const base = {
    name: "Build-a-bot",
    descriptionLexical: { mock: true } as unknown,
    communityId: "comm-1",
    userId: "user-1",
    slug: "build-a-bot-x",
    teamMin: 2,
    teamMax: 4,
  };

  it("creates a draft challenge with empty objectives and cellTemplate", () => {
    const data = buildHackathonChallengeData(base);
    expect(data.status).toBe("draft");
    expect(data.type).toBe("open-ended");
    expect(data.difficulty).toBe("intermediate");
    expect(data.title).toBe("Build-a-bot");
    expect(data.slug).toBe("build-a-bot-x");
    expect(data.creatorId).toBe("user-1");
    expect(data.publishedBy).toBe("member");
    expect(data.communityId).toBe("comm-1");
    expect(data.objectives).toEqual([]);
    expect(data.cellTemplate).toEqual([]);
    expect(data.rewards).toEqual({ xpReward: 0 });
    expect(data.teamConfig).toEqual({ minTeamSize: 2, maxTeamSize: 4 });
  });
});
