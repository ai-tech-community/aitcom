// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type * as ContentVisibilityQueries from "@/server/communities/content-visibility-queries";

const SECRET = "c-secret-9";

const hooks = vi.hoisted(() => ({
  hiddenIds: ["c-secret-9"] as string[],
  community: null as {
    id: string;
    slug: string;
    isListedInDirectory: boolean;
  } | null,
}));

vi.mock("@/server/db", () => ({
  db: {},
}));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => ({
    agentId: "agent-1",
    ownerId: "owner-1",
    scopes: ["read"],
  }),
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({ find: vi.fn() }),
}));
vi.mock(
  "@/server/communities/content-visibility-queries",
  async (importOriginal) => {
    const actual = await importOriginal<typeof ContentVisibilityQueries>();
    return {
      ...actual,
      hiddenContentCommunityIds: async () => hooks.hiddenIds,
      findReadableCommunityBySlug: async () => hooks.community,
    };
  },
);

import { agentRouter } from "./agent";
import { KNOWLEDGE_SEARCH_ERROR } from "@/server/agent/knowledge-search";

const dialect = new PgDialect({ casing: "snake_case" });

const leaked = () =>
  new Error(
    `Failed query: select count(*) from "forum_threads" where (("forum_threads"."title" ilike $1 or "forum_threads"."content" ilike $2) and ("forum_threads"."community_id" is null or "community_id" not in ($3)))\nparams: %pricing%,%pricing%,${SECRET}`,
  );

function threadDb(fail?: Error) {
  const seen: { query?: SQL } = {};
  const execute = vi.fn(async (query: SQL) => {
    seen.query = query;
    if (fail) throw fail;
    return {
      rows: [
        {
          id: 76,
          title: "Price this job",
          content: {
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
          },
          createdAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    };
  });
  return {
    seen,
    execute,
    update: () => ({
      set: () => ({
        where: () => ({ catch: () => undefined }),
      }),
    }),
  };
}

function caller(db: ReturnType<typeof threadDb>) {
  return agentRouter.createCaller({
    db: db as never,
    session: null,
    headers: new Headers({ authorization: "Bearer test-key" }),
  });
}

describe("agent.searchKnowledge threads", () => {
  beforeEach(() => {
    hooks.hiddenIds = [SECRET];
    hooks.community = null;
  });

  it("returns a body snippet for a content match and casts content to text", async () => {
    const db = threadDb();
    const results = await caller(db).searchKnowledge({
      query: "pricing",
      type: "threads",
    });

    expect(results).toEqual([
      {
        type: "thread",
        id: 76,
        title: "Price this job",
        snippet: "Post a real job. The pricing number should hold up.",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ]);
    const rendered = dialect.sqlToQuery(db.seen.query!);
    expect(rendered.sql).toContain(`"content"::text ILIKE`);
    expect(rendered.sql).not.toMatch(/"content" ILIKE/);
    expect(rendered.params).toContain("%pricing%");
    expect(rendered.params).toContain(SECRET);
    expect(JSON.stringify(results)).not.toContain(SECRET);
  });

  it.each(["threads", "all"] as const)(
    "does not leak SQL or community ids when type %s fails",
    async (type) => {
      const errorLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const db = threadDb(leaked());
      const failure = caller(db)
        .searchKnowledge({ query: "pricing", type })
        .catch((error: unknown) => error);

      const error = await failure;
      expect(error).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: KNOWLEDGE_SEARCH_ERROR,
      });
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? (error.stack ?? "") : "";
      expect(message).not.toMatch(/select|ilike|forum_threads|params:/i);
      expect(message).not.toContain(SECRET);
      expect(stack).not.toContain(SECRET);
      expect(stack).not.toContain("forum_threads");
      errorLog.mockRestore();
    },
  );

  it("still reports a missing community without querying threads", async () => {
    hooks.community = null;
    const db = threadDb();
    await expect(
      caller(db).searchKnowledge({
        query: "pricing",
        type: "threads",
        communitySlug: "missing",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Community not found",
    });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
