import { beforeAll, expect, it, vi } from "vitest";

import type { MagazineIssue } from "@/payload-types";

process.env.SKIP_ENV_VALIDATION ??= "true";
process.env.DATABASE_URL ??=
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:1/none",
    NEXT_PUBLIC_APP_URL: "https://example.org",
  },
}));
vi.mock("@/server/db", () => ({ db: {} }));

let presentBrowsedIssue: (
  issue: MagazineIssue,
  agentReview: "pending" | "draft" | null,
) => {
  updatedAt: string;
  slug: string;
  agentReview: "pending" | "draft" | null;
};

beforeAll(async () => {
  ({ presentBrowsedIssue } = await import("./agent-magazine"));
});

it("returns the issue updatedAt save-magazine-issue requires", () => {
  const issue = presentBrowsedIssue(
    {
      id: 4,
      number: 1,
      title: "How to price a job",
      slug: "how-to-price-a-job",
      status: "draft",
      visibility: "members",
      coverImageUrl: null,
      publishedAt: null,
      updatedAt: "2026-10-28T10:28:07.238Z",
      items: [],
    } as unknown as MagazineIssue,
    "draft",
  );
  expect(issue.updatedAt).toBe("2026-10-28T10:28:07.238Z");
  expect(issue.slug).toBe("how-to-price-a-job");
  expect(issue.agentReview).toBe("draft");
});
