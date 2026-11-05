import { TRPCError } from "@trpc/server";
import { type SQL, and, sql } from "drizzle-orm";

import { HUB_SLUG } from "@/server/communities/hub";

/**
 * Message returned to an API caller when knowledge search fails.
 * Database errors include the SQL text and bound ids; those stay in server logs.
 */
export const KNOWLEDGE_SEARCH_ERROR = "Knowledge search failed.";

const SQL_LEAK =
  /failed query:|\bselect\b|\binsert\b|\bdelete\b|\bilike\b|forum_threads|\$\d+|params:/i;

type CommunityRef = { id: string; slug: string };

export type KnowledgeSearchQuery = {
  query: string;
  community?: CommunityRef | null;
  hiddenCommunityIds?: readonly string[];
};

export type KnowledgeSearchHit = {
  type: string;
  id: number;
  title: string;
  snippet: string;
  createdAt: string;
};

export type KnowledgeSearchInput = {
  query: string;
  type: "threads" | "articles" | "ideas" | "all";
  limit: number;
  communitySlug?: string;
};

/**
 * Payload `contains` becomes `ILIKE`. `forum_threads.content` is jsonb
 * (Lexical), and Postgres has no jsonb ILIKE operator, so the column is
 * cast to text. LIKE metacharacters in the caller's query stay literal.
 */
export function likeContainsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function forumCommunityScope(community: CommunityRef): SQL {
  if (community.slug === HUB_SLUG) {
    return sql`("forum_threads"."community_id" = ${community.id} OR "forum_threads"."community_id" IS NULL)`;
  }
  return sql`"forum_threads"."community_id" = ${community.id}`;
}

function hiddenCommunityScope(ids: readonly string[]): SQL | undefined {
  if (ids.length === 0) return undefined;
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  return sql`("forum_threads"."community_id" IS NULL OR "forum_threads"."community_id" NOT IN (${list}))`;
}

export function forumThreadSearchWhere(input: KnowledgeSearchQuery): SQL {
  const pattern = likeContainsPattern(input.query);
  const textMatch = sql`("forum_threads"."title" ILIKE ${pattern} ESCAPE '\\' OR "forum_threads"."content"::text ILIKE ${pattern} ESCAPE '\\')`;
  const scope = input.community
    ? forumCommunityScope(input.community)
    : hiddenCommunityScope(input.hiddenCommunityIds ?? []);
  const where = and(textMatch, scope);
  if (!where) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: KNOWLEDGE_SEARCH_ERROR,
    });
  }
  return where;
}

export type ForumThreadRow = {
  id: number;
  title: string;
  content: unknown;
  createdAt: string;
};

/** The thread search statement. `content` is cast in {@link forumThreadSearchWhere}. */
export function forumThreadSearchStatement(
  input: KnowledgeSearchQuery & { limit: number },
): SQL {
  return sql`
    SELECT id, title, content, created_at AS "createdAt"
    FROM "forum_threads"
    WHERE ${forumThreadSearchWhere(input)}
    ORDER BY created_at DESC
    LIMIT ${input.limit}
  `;
}

/** Neon returns `{ rows }`; some Drizzle builds return the array itself. */
export function readForumThreadRows(result: unknown): ForumThreadRow[] {
  const rows = (result as { rows?: unknown }).rows ?? result;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const createdAt = record.createdAt ?? record.created_at;
    return {
      id: Number(record.id),
      title: typeof record.title === "string" ? record.title : "",
      content: record.content,
      createdAt: typeof createdAt === "string" ? createdAt : "",
    };
  });
}

/**
 * Plain-text snippet from a Payload rich-text (Lexical) field.
 * Empty when the value is not a Lexical document.
 */
export function richTextSnippet(field: unknown, maxLen = 200): string {
  if (!field || typeof field !== "object") return "";
  const root = (field as Record<string, unknown>).root as
    | { children?: { text?: string; children?: unknown[] }[] }
    | undefined;
  if (!root?.children) return "";

  const texts: string[] = [];
  function walk(nodes: unknown[]) {
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as Record<string, unknown>;
      if (typeof n.text === "string") texts.push(n.text);
      if (Array.isArray(n.children)) walk(n.children);
    }
  }
  walk(root.children as unknown[]);
  const joined = texts.join(" ").trim();
  return joined.length > maxLen ? joined.slice(0, maxLen) + "..." : joined;
}

/** Body text when the thread has any, otherwise the title. */
export function threadSnippet(
  content: unknown,
  title: string,
  maxLen = 200,
): string {
  return richTextSnippet(content, maxLen) || title;
}

/**
 * Text an API caller may see. Unexpected database errors become
 * {@link KNOWLEDGE_SEARCH_ERROR}. Deliberate tRPC errors (not found, forbidden)
 * keep their message when that message is not SQL.
 */
export function publicKnowledgeSearchMessage(error: unknown): string {
  if (error instanceof TRPCError && !SQL_LEAK.test(error.message)) {
    return error.message;
  }
  return KNOWLEDGE_SEARCH_ERROR;
}

export function knowledgeSearchToolResult(error: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return {
    content: [{ type: "text", text: publicKnowledgeSearchMessage(error) }],
    isError: true,
  };
}

export async function runSearchKnowledgeTool(
  search: (
    input: KnowledgeSearchInput,
  ) => Promise<readonly KnowledgeSearchHit[]>,
  input: KnowledgeSearchInput,
): Promise<{
  content: { type: "text"; text: string }[];
  isError?: true;
}> {
  try {
    const result = await search(input);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return knowledgeSearchToolResult(error);
  }
}
