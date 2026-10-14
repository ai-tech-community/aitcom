import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishApprovedEditorialDrafts = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/publish-approved-storylines", () => ({
  publishApprovedEditorialDrafts,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/cron/publish-approved-storylines",
    { headers: auth ? { authorization: auth } : {} },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  publishApprovedEditorialDrafts.mockResolvedValue({
    scanned: 1,
    published: [
      {
        draftId: "f79b8204-0a7a-485a-82c9-a2a072034eab",
        id: "story-1",
        slug: "local-ai",
      },
    ],
    skipped: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publish approved storylines", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(publishApprovedEditorialDrafts).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(publishApprovedEditorialDrafts).not.toHaveBeenCalled();
  });

  it("publishes saved approvals and can be run again", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      published: Array<{ draftId: string; slug: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.published[0]?.draftId).toBe(
      "f79b8204-0a7a-485a-82c9-a2a072034eab",
    );
    expect(publishApprovedEditorialDrafts).toHaveBeenCalledOnce();
  });
});
