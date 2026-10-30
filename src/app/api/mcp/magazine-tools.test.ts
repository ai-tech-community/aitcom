import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { registerMagazineTools } from "./magazine-tools";
import { TOOL_META } from "@/server/mcp/catalog-meta";
import {
  ADDITIVE_WRITE,
  DRAFT_FOR_REVIEW,
  READ_ONLY,
} from "@/server/mcp/tool-annotations";

it("registers read and draft-only magazine tools that cannot publish", async () => {
  const tools = new Map<
    string,
    { config: Record<string, unknown>; run: (input: never) => Promise<unknown> }
  >();
  const server = {
    registerTool: (
      name: string,
      config: Record<string, unknown>,
      run: (input: never) => Promise<unknown>,
    ) => tools.set(name, { config, run }),
  };
  const caller = {
    agent: {
      browseMagazines: vi.fn().mockResolvedValue({ magazines: [] }),
      readMagazineArticle: vi.fn().mockResolvedValue({
        articleId: 58,
        status: "published",
        blocks: [],
      }),
      saveMagazineArticle: vi.fn().mockResolvedValue({ status: "draft" }),
      markArticleReady: vi.fn().mockResolvedValue({
        ready: false,
        failures: ["Add at least one H2 heading"],
      }),
      uploadImage: vi
        .fn()
        .mockResolvedValue({ url: "https://cdn.example.test/a.png" }),
      saveMagazineIssue: vi.fn().mockResolvedValue({ status: "draft" }),
      submitIssueForReview: vi.fn().mockResolvedValue({
        status: "pending_review",
        published: false,
        subscriberEmail: "not_sent",
      }),
    },
  };
  registerMagazineTools(server as never, caller as never);
  expect([...tools.keys()]).toEqual([
    "browse-magazines",
    "read-magazine-article",
    "save-magazine-article",
    "mark-article-ready",
    "upload-image",
    "save-magazine-issue",
    "submit-issue-for-review",
    "create-magazine",
    "update-magazine",
    "delete-magazine-issue",
    "delete-magazine-article",
    "assign-magazine-agent",
  ]);
  expect(tools.has("publish-issue")).toBe(false);
  for (const name of tools.keys()) {
    expect(TOOL_META[name], name).toEqual({
      surface: "magazines",
      gate:
        name.startsWith("browse-") || name.startsWith("read-")
          ? "read"
          : "contribute",
    });
    const description = String(tools.get(name)!.config.description);
    if (
      !name.startsWith("browse-") &&
      !name.startsWith("read-") &&
      name !== "upload-image"
    ) {
      expect(description.toLowerCase()).toContain("cannot publish");
    }
  }
  expect(String(tools.get("browse-magazines")!.config.description)).toContain(
    "updatedAt",
  );
  expect(
    String(tools.get("save-magazine-issue")!.config.description),
  ).toContain("updatedAt");
  const issueFields = tools.get("save-magazine-issue")!.config.inputSchema as {
    expectedUpdatedAt?: { description?: string };
  };
  expect(issueFields.expectedUpdatedAt?.description).toMatch(
    /optimistic concurrency/i,
  );
  expect(issueFields.expectedUpdatedAt?.description).toContain(
    "browse-magazines",
  );
  expect(tools.get("browse-magazines")!.config.annotations).toEqual(READ_ONLY);
  expect(tools.get("read-magazine-article")!.config.annotations).toEqual(
    READ_ONLY,
  );
  await tools.get("read-magazine-article")!.run({ articleId: 58 } as never);
  expect(caller.agent.readMagazineArticle).toHaveBeenCalledWith({
    articleId: 58,
  });
  expect(tools.get("save-magazine-article")!.config.annotations).toEqual(
    DRAFT_FOR_REVIEW,
  );
  expect(
    String(tools.get("save-magazine-article")!.config.description),
  ).toContain("videoUrl");
  expect(tools.get("upload-image")!.config.annotations).toEqual(ADDITIVE_WRITE);
  expect(tools.get("save-magazine-issue")!.config.annotations).toEqual(
    DRAFT_FOR_REVIEW,
  );
  expect(tools.get("submit-issue-for-review")!.config.annotations).toEqual(
    DRAFT_FOR_REVIEW,
  );
  const submitted = await tools
    .get("submit-issue-for-review")!
    .run({ issueId: 4 } as never);
  expect(caller.agent.submitIssueForReview).toHaveBeenCalledWith({
    issueId: 4,
  });
  expect(submitted).toMatchObject({
    content: [
      {
        type: "text",
        text: expect.stringContaining('"subscriberEmail": "not_sent"'),
      },
    ],
  });
});

it("does not send subscriber email from the magazine agent service", () => {
  const source = readFileSync("src/server/magazines/agent-magazine.ts", "utf8");
  expect(source).not.toContain("issueMail");
  expect(source).not.toContain("deliverPendingAnnouncements");
  expect(source).toContain("publishIssue");
});
