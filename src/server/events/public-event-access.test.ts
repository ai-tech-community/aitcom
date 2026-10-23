import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "@/server/communities/hub";

import {
  hiddenEventCommunityIds,
  viewerMaySeeEvent,
} from "./public-event-access";

/** Column names, operators, and bound values from a Drizzle condition. */
function sqlText(node: unknown): string {
  if (node == null) return "";
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return String(node);
  }
  if (Array.isArray(node)) return node.map((part) => sqlText(part)).join("");
  if (typeof node !== "object") return "";
  const obj = node as {
    value?: unknown;
    name?: unknown;
    queryChunks?: unknown[];
  };
  const parts: string[] = [];
  if (typeof obj.name === "string") parts.push(obj.name);
  if (
    typeof obj.value === "string" ||
    typeof obj.value === "number" ||
    typeof obj.value === "boolean"
  ) {
    parts.push(String(obj.value));
  } else if (
    Array.isArray(obj.value) &&
    obj.value.every((part) => typeof part === "string")
  ) {
    parts.push(obj.value.join(""));
  }
  if (obj.queryChunks) {
    parts.push(obj.queryChunks.map((chunk) => sqlText(chunk)).join(""));
  }
  return parts.join("");
}

function queryDb(withMemberSubquery: boolean) {
  let calls = 0;
  let where: unknown;
  const db = {
    select() {
      const chain = {
        from() {
          return chain;
        },
        where(clause: unknown) {
          calls += 1;
          // The membership lookup is a subquery. Return its SQL so the
          // outer `not in` keeps the member predicate.
          if (withMemberSubquery && calls === 1) return clause;
          where = clause;
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
  return {
    db: db as never,
    sql: () => sqlText(where),
  };
}

function fakeDb(options: {
  community?: {
    id: string;
    slug: string;
    isListedInDirectory: boolean;
    joinPolicy: "open" | "invite_only" | "approval_required";
  } | null;
  member?: boolean;
}) {
  return {
    query: {
      communities: {
        findFirst: async () => options.community ?? null,
      },
      communityMemberships: {
        findFirst: async () => (options.member ? { communityId: "c" } : null),
      },
    },
  } as never;
}

describe("hiddenEventCommunityIds", () => {
  it("hides unlisted communities and any join policy outside the public allow-list", async () => {
    const query = queryDb(false);
    await hiddenEventCommunityIds(query.db, null);
    const sql = query.sql();
    expect(sql).toContain("isListedInDirectory");
    expect(sql).toContain("joinPolicy");
    expect(sql).toContain("open");
    expect(sql).toContain("approval_required");
    expect(sql).not.toContain("invite_only");
    expect(sql).toContain("not in");
    expect(sql).toContain(HUB_SLUG);
    expect(sql).not.toContain("userId");
  });

  it("leaves out communities the viewer already belongs to", async () => {
    const query = queryDb(true);
    await hiddenEventCommunityIds(query.db, "member-1");
    const sql = query.sql();
    expect(sql).toContain("approval_required");
    expect(sql).toContain("not in");
    expect(sql).toContain("userId");
    expect(sql).toContain("member-1");
    expect(sql).toContain("active");
  });
});

describe("viewerMaySeeEvent", () => {
  const studio = {
    id: "studio",
    slug: "ait-demo-studio",
    isListedInDirectory: false,
    joinPolicy: "invite_only" as const,
  };

  it("hides a private invite-only community from a guest", async () => {
    await expect(
      viewerMaySeeEvent(fakeDb({ community: studio }), "studio", null),
    ).resolves.toBe(false);
  });

  it("hides a listed invite-only community from a signed-in non-member", async () => {
    const listed = {
      ...studio,
      slug: "sunday-runners-demo",
      isListedInDirectory: true,
    };
    await expect(
      viewerMaySeeEvent(fakeDb({ community: listed }), "studio", "guest-user"),
    ).resolves.toBe(false);
  });

  it("shows that community to an active member", async () => {
    await expect(
      viewerMaySeeEvent(
        fakeDb({ community: studio, member: true }),
        "studio",
        "member-1",
      ),
    ).resolves.toBe(true);
  });

  it("keeps an event with no community public", async () => {
    await expect(viewerMaySeeEvent(fakeDb({}), null, null)).resolves.toBe(true);
  });

  it("fails closed when the community row is missing", async () => {
    await expect(
      viewerMaySeeEvent(fakeDb({ community: null }), "gone", null),
    ).resolves.toBe(false);
  });
});
