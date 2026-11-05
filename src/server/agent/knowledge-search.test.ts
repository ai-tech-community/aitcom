// @vitest-environment node

import { TRPCError } from "@trpc/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  forumThreadSearchWhere,
  KNOWLEDGE_SEARCH_ERROR,
  likeContainsPattern,
  publicKnowledgeSearchMessage,
  readForumThreadRows,
  richTextSnippet,
  runSearchKnowledgeTool,
  threadSnippet,
} from "./knowledge-search";

const dialect = new PgDialect({ casing: "snake_case" });
const SECRET = "c-secret-9";

const pricingBody = {
  root: {
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            text: "Post a real job. The pricing number should hold up.",
          },
        ],
      },
    ],
  },
};

function sqlOf(query: Parameters<typeof forumThreadSearchWhere>[0]) {
  return dialect.sqlToQuery(forumThreadSearchWhere(query));
}

describe("forum thread search SQL", () => {
  it("casts jsonb content to text and binds the pattern and hidden community ids", () => {
    const rendered = sqlOf({
      query: "pricing",
      hiddenCommunityIds: [SECRET, "c-secret-10"],
    });

    expect(rendered.sql).toContain(`"content"::text ILIKE`);
    expect(rendered.sql).not.toMatch(/"content" ILIKE/);
    expect(rendered.sql).toContain("ESCAPE");
    expect(rendered.sql.toLowerCase()).toContain("is null");
    expect(rendered.sql.toLowerCase()).toContain("not in");
    expect(rendered.sql).not.toContain(SECRET);
    expect(rendered.params).toEqual([
      "%pricing%",
      "%pricing%",
      SECRET,
      "c-secret-10",
    ]);
  });

  it("keeps LIKE metacharacters and quotes inside the bound pattern", () => {
    expect(likeContainsPattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
    const rendered = sqlOf({ query: "pricing' OR 1=1 --" });
    expect(rendered.sql).not.toContain("1=1");
    expect(rendered.params).toEqual([
      "%pricing' OR 1=1 --%",
      "%pricing' OR 1=1 --%",
    ]);
  });

  it("scopes a listed community to its id and the Hub to unscoped threads too", () => {
    const listed = sqlOf({
      query: "pricing",
      community: { id: "community-1", slug: "owner-to-owner" },
      hiddenCommunityIds: [SECRET],
    });
    expect(listed.sql.toLowerCase()).not.toContain("is null");
    expect(listed.sql.toLowerCase()).not.toContain("not in");
    expect(listed.params).toEqual(["%pricing%", "%pricing%", "community-1"]);

    const hub = sqlOf({
      query: "pricing",
      community: { id: "hub-1", slug: "ait" },
    });
    expect(hub.sql.toLowerCase()).toContain("is null");
    expect(hub.params).toEqual(["%pricing%", "%pricing%", "hub-1"]);
  });
});

describe("thread snippets", () => {
  it("reads the Lexical body instead of falling back to the title", () => {
    expect(threadSnippet(pricingBody, "Price this job")).toBe(
      "Post a real job. The pricing number should hold up.",
    );
    expect(threadSnippet(null, "Price this job")).toBe("Price this job");
    expect(richTextSnippet(pricingBody, 16)).toBe("Post a real job....");
  });

  it("reads rows from either driver shape", () => {
    const row = {
      id: 76,
      title: "Price this job",
      content: pricingBody,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    expect(readForumThreadRows({ rows: [row] })).toEqual([row]);
    expect(readForumThreadRows([row])).toEqual([row]);
  });
});

describe("search-knowledge errors", () => {
  const leaked = new Error(
    `Failed query: select count(*) from "forum_threads" where (("forum_threads"."title" ilike $1 or "forum_threads"."content" ilike $2) and ("forum_threads"."community_id" is null or "community_id" not in ($3)))\nparams: %pricing%,%pricing%,${SECRET}`,
  );

  it("replaces SQL failures and keeps deliberate tRPC messages", () => {
    expect(publicKnowledgeSearchMessage(leaked)).toBe(KNOWLEDGE_SEARCH_ERROR);
    expect(publicKnowledgeSearchMessage(leaked)).not.toContain("select");
    expect(publicKnowledgeSearchMessage(leaked)).not.toContain(SECRET);
    expect(publicKnowledgeSearchMessage(leaked)).not.toContain("forum_threads");
    expect(
      publicKnowledgeSearchMessage(
        new TRPCError({ code: "NOT_FOUND", message: "Community not found" }),
      ),
    ).toBe("Community not found");
    expect(
      publicKnowledgeSearchMessage(
        new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: leaked.message,
        }),
      ),
    ).toBe(KNOWLEDGE_SEARCH_ERROR);
  });

  it("returns matching threads as JSON and a clean tool error", async () => {
    const hit = {
      type: "thread",
      id: 76,
      title: "Price this job",
      snippet: "Post a real job. The pricing number should hold up.",
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    const ok = await runSearchKnowledgeTool(async () => [hit], {
      query: "pricing",
      type: "threads",
      limit: 10,
    });
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0]?.text).toContain("pricing number");
    expect(ok.content[0]?.text).not.toContain(SECRET);

    const failed = await runSearchKnowledgeTool(
      async () => {
        throw leaked;
      },
      {
        query: "pricing",
        type: "all",
        limit: 10,
      },
    );
    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual([
      { type: "text", text: KNOWLEDGE_SEARCH_ERROR },
    ]);
    const text = failed.content[0]?.text ?? "";
    expect(text).not.toMatch(/select|ilike|forum_threads|params:/i);
    expect(text).not.toContain(SECRET);
  });
});
