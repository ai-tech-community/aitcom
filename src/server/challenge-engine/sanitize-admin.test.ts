import { describe, expect, it } from "vitest";

import { text } from "./lexical";
import {
  sanitizeChallengeCellTemplate,
  sanitizeChallengeDescription,
  sanitizeChallengeForAdmin,
} from "./sanitize-admin";

/**
 * Live Payload document for challenge id 9 as returned by
 * `challenges.getById` on 2026-08-20 (www.aitcommunity.org).
 * The admin editor blank-forms this row; bulk Status→Draft save reverts.
 */
const liveChallenge9 = {
  id: 9,
  title: "test",
  slug: "test-c-1781069637721",
  description: {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      children: [
        {
          type: "paragraph",
          format: "",
          indent: 0,
          version: 1,
          children: [{ text: "tes", type: "text", format: 0, version: 1 }],
          direction: "ltr",
        },
      ],
      direction: "ltr",
    },
  },
  type: "open-ended",
  status: "active",
  difficulty: "intermediate",
  publishedBy: "member",
  generatedBy: "human",
  creatorId: "bRllr0OX65NMQUWYy96wyz0jduBLLHj5",
  objectives: [],
  rewards: { xpReward: 0, badgeReward: "", sponsorReward: "" },
  cellTemplate: [
    {
      id: "6a28fb19709b54d2731c5b69",
      description: "task 1",
      taskType: "creative",
      verificationMode: "self-report",
      deadlineMinutes: 60,
    },
    {
      id: "6a28fb19709b54d2731c5b6a",
      description: "task 2",
      taskType: "prototype",
      verificationMode: "peer-review",
      deadlineMinutes: 60,
    },
  ],
  tags: null,
  signalSource: { type: null, reference: null, summary: null },
  communityId: "5cd74b98-3374-4fa4-b16f-fa48bfae8880",
};

describe("sanitizeChallengeForAdmin", () => {
  it("coerces the live id-9 junk row into an admin-safe document", () => {
    const sanitized = sanitizeChallengeForAdmin(liveChallenge9);

    expect(sanitized.tags).toEqual([]);
    expect(sanitized.rewards).toEqual({
      xpReward: 0,
      badgeReward: null,
      sponsorReward: null,
    });
    expect(sanitized.signalSource).toEqual({
      reference: null,
      summary: null,
    });

    const text = (
      sanitized.description as {
        root: { children: { children: { mode?: string; detail?: number }[] }[] };
      }
    ).root.children[0]!.children[0]!;
    expect(text.mode).toBe("normal");
    expect(text.detail).toBe(0);

    const cells = sanitized.cellTemplate as { deadlineMinutes: number }[];
    expect(cells).toHaveLength(2);
    expect(cells.every((c) => typeof c.deadlineMinutes === "number")).toBe(
      true,
    );
    // Sanitizer must not flip status — drafting is the data migration's job
    // and must not touch "Build Your First MCP Tool" / "Build the AIT Benchmark".
    expect(sanitized.status).toBe("active");
    expect(sanitized.title).toBe("test");
    expect(sanitized.slug).toBe("test-c-1781069637721");
  });

  it("does not rewrite a healthy tags array (protected published challenges)", () => {
    const sanitized = sanitizeChallengeForAdmin({
      title: "Build Your First MCP Tool",
      slug: "build-your-first-mcp-tool",
      tags: ["mcp", "typescript"],
      rewards: { xpReward: 500, badgeReward: "mcp-builder" },
    });
    expect(sanitized.tags).toEqual(["mcp", "typescript"]);
    expect(sanitized.rewards).toEqual({
      xpReward: 500,
      badgeReward: "mcp-builder",
    });
  });

  it("turns a missing description into an empty Lexical root so the editor can mount", () => {
    const description = sanitizeChallengeDescription(null) as {
      root: { type: string; children: unknown[] };
    };
    expect(description.root.type).toBe("root");
    expect(Array.isArray(description.root.children)).toBe(true);
  });

  it("emits complete Lexical text nodes so new writes do not re-break the admin editor", () => {
    expect(text("tes")).toMatchObject({
      type: "text",
      text: "tes",
      version: 1,
      format: 0,
      detail: 0,
      mode: "normal",
      style: "",
    });
  });

  it("coerces string deadlineMinutes on cellTemplate rows", () => {
    const cells = sanitizeChallengeCellTemplate([
      {
        description: "task",
        taskType: "creative",
        verificationMode: "self-report",
        deadlineMinutes: "45",
      },
    ]) as { deadlineMinutes: number }[];
    expect(cells[0]!.deadlineMinutes).toBe(45);
  });
});
