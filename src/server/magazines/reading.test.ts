import type { Where } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Magazine, MagazineIssue } from "@/payload-types";
import type { MagazineRole } from "@/lib/magazines/roles";
import type { CommunityRole } from "@/server/communities/role-utils";

import type { Deps } from "./deps";
import type * as EditorshipModule from "./editorship";
import type * as ReadableIssuesModule from "./readable-issues";
import { loadMagazineEditorship } from "./editorship";
import { buildIssueReadScope, loadIssueReadScope } from "./readable-issues";
import { loadCommunityMagazineTab, loadMagazineShelf } from "./reading";

// Reader dependencies are supplied by the fixture; never initialize a real DB.
vi.mock("@/server/db", () => ({ db: {} }));

vi.mock("./editorship", async (importOriginal) => {
  const actual = await importOriginal<typeof EditorshipModule>();
  return {
    ...actual,
    loadMagazineEditorship: vi.fn(actual.loadMagazineEditorship),
  };
});
vi.mock("./readable-issues", async (importOriginal) => {
  const actual = await importOriginal<typeof ReadableIssuesModule>();
  return { ...actual, loadIssueReadScope: vi.fn() };
});

const community = {
  id: "community-1",
  name: "Night Owls",
  slug: "night-owls",
  isListedInDirectory: false,
};
const magazine: Magazine = {
  id: 42,
  communityId: community.id,
  name: "The Gazette",
  slug: "gazette",
  createdBy: "owner-1",
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
};

function issue(id: number, overrides: Partial<MagazineIssue>): MagazineIssue {
  return {
    id,
    magazine: magazine.id,
    communityId: community.id,
    number: id,
    title: `Issue ${id}`,
    slug: `issue-${id}`,
    status: "published",
    visibility: "members",
    publishedAt: "2026-10-27T00:00:00.000Z",
    createdAt: "2026-10-27T00:00:00.000Z",
    updatedAt: "2026-10-27T00:00:00.000Z",
    ...overrides,
  };
}

const issues = [
  issue(4, { status: "draft" }),
  issue(3, { visibility: "public", publicConfirmedAt: null }),
  issue(2, {}),
  issue(1, {
    visibility: "public",
    publicConfirmedAt: "2026-10-26T00:00:00.000Z",
  }),
];

/** In-memory Payload filtering at its public find seam. */
function matches(where: Where, row: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "and")
      return (condition as Where[]).every((part) => matches(part, row));
    if (field === "or")
      return (condition as Where[]).some((part) => matches(part, row));
    const operator = condition as {
      equals?: unknown;
      not_equals?: unknown;
      exists?: boolean;
      in?: unknown[];
      not_in?: unknown[];
    };
    if ("equals" in operator) return row[field] === operator.equals;
    if ("not_equals" in operator) return row[field] !== operator.not_equals;
    if ("exists" in operator) return (row[field] != null) === operator.exists;
    if (operator.in) return operator.in.includes(row[field]);
    if (operator.not_in) return !operator.not_in.includes(row[field]);
    throw new Error(`Unexpected predicate on ${field}`);
  });
}

function fixture(
  opts: {
    communityRole?: CommunityRole;
    role?: MagazineRole;
    status?: string;
    magazine?: Magazine | null;
  } = {},
) {
  const membership = vi.fn().mockResolvedValue({
    role: opts.communityRole ?? "member",
    status: opts.status ?? "active",
  });
  const staff = vi
    .fn()
    .mockResolvedValue(opts.role ? { role: opts.role } : undefined);
  const communityBySlug = vi.fn().mockResolvedValue(community);
  const communitiesById = vi.fn().mockResolvedValue([community]);
  const find = vi.fn(async (input: { collection: string; where?: Where }) => ({
    docs:
      input.collection === "magazines"
        ? opts.magazine === null
          ? []
          : [opts.magazine ?? magazine]
        : issues.filter(
            (row) =>
              !input.where ||
              matches(input.where, row as unknown as Record<string, unknown>),
          ),
  }));
  const deps = {
    db: {
      query: {
        communities: { findFirst: communityBySlug, findMany: communitiesById },
        communityMemberships: { findFirst: membership },
        magazineStaff: { findFirst: staff },
      },
    },
    payload: { find },
  } as unknown as Deps;
  return { deps, membership, staff, communityBySlug, communitiesById, find };
}

beforeEach(() => {
  vi.mocked(loadMagazineEditorship).mockClear();
  vi.mocked(loadIssueReadScope).mockReset();
});

const tabOptions = {
  communitySlug: community.slug,
  viewerId: "viewer-1",
  locale: "en",
} as const;

describe("magazine reading standing", () => {
  it.each(["editor", "contributor"] as const)(
    "uses one %s standing for the desk and published member issues",
    async (role) => {
      const fx = fixture({ role });
      const result = await loadCommunityMagazineTab(fx.deps, tabOptions);
      expect(result).toMatchObject({
        viewerRole: role,
        viewerIsEditor: role === "editor",
        latest: { id: 3 },
      });
      expect(result!.issues.map((row) => row.id)).toEqual([3, 2, 1]);
      expect(result!.draftIssues.map((row) => row.id)).toEqual(
        role === "editor" ? [4] : [],
      );
      expect(loadMagazineEditorship).toHaveBeenCalledExactlyOnceWith(
        fx.deps.db,
        { communityId: community.id, magazineId: magazine.id },
        "viewer-1",
      );
      expect(fx.membership).toHaveBeenCalledTimes(1);
      expect(fx.staff).toHaveBeenCalledTimes(1);
      expect(fx.communityBySlug).toHaveBeenCalledTimes(1);
      expect(fx.communitiesById).not.toHaveBeenCalled();
      expect(loadIssueReadScope).not.toHaveBeenCalled();
    },
  );

  it.each([
    { viewerId: null, status: "active", expectedReads: 0 },
    { viewerId: "banned-editor", status: "banned", expectedReads: 1 },
  ])(
    "uses the same missing standing to hide member issues and the desk ($viewerId)",
    async ({ viewerId, status, expectedReads }) => {
      const fx = fixture({ role: "editor", status });
      const result = await loadCommunityMagazineTab(fx.deps, {
        ...tabOptions,
        viewerId,
      });
      expect(result).toMatchObject({
        viewerRole: null,
        viewerIsEditor: false,
        latest: { id: 1 },
      });
      expect(result!.issues.map((row) => row.id)).toEqual([1]);
      expect(result!.draftIssues).toEqual([]);
      expect(loadMagazineEditorship).toHaveBeenCalledTimes(1);
      expect(fx.membership).toHaveBeenCalledTimes(expectedReads);
      expect(fx.staff).toHaveBeenCalledTimes(expectedReads);
      expect(loadIssueReadScope).not.toHaveBeenCalled();
    },
  );

  it("keeps the leader's standing when the magazine has not been started", async () => {
    const fx = fixture({ communityRole: "owner", magazine: null });
    expect(await loadCommunityMagazineTab(fx.deps, tabOptions)).toEqual({
      magazine: null,
      latest: null,
      issues: [],
      viewerRole: "editor_in_chief",
      viewerIsEditor: true,
      draftIssues: [],
    });
    expect(loadMagazineEditorship).toHaveBeenCalledExactlyOnceWith(
      fx.deps.db,
      { communityId: community.id, magazineId: null },
      "viewer-1",
    );
    expect(fx.membership).toHaveBeenCalledTimes(1);
    expect(fx.staff).not.toHaveBeenCalled();
    expect(fx.find).toHaveBeenCalledTimes(1);
    expect(loadIssueReadScope).not.toHaveBeenCalled();
  });

  it("still loads a standalone shelf's scope once and respects it", async () => {
    const fx = fixture({ magazine: { ...magazine, font: "bodoni" } });
    vi.mocked(loadIssueReadScope).mockResolvedValue(
      buildIssueReadScope({ editorCommunityIds: [], memberCommunityIds: [] }, [
        { ...community, deletedAt: null },
      ]),
    );
    const result = await loadMagazineShelf(fx.deps, {
      magazineSlug: magazine.slug,
      viewerId: null,
      locale: "en",
    });
    expect(result).toMatchObject({
      viewerIsEditor: false,
      magazine: { id: 42, font: "bodoni" },
    });
    expect(result!.issues.map((row) => row.id)).toEqual([1]);
    expect(result!.unpublishedForEditor).toBe(false);
    expect(loadIssueReadScope).toHaveBeenCalledExactlyOnceWith(
      fx.deps.db,
      null,
    );
    expect(loadMagazineEditorship).not.toHaveBeenCalled();
  });

  it("keeps drafts off the public shelf and tells an editor they exist", async () => {
    const fx = fixture();
    vi.mocked(loadIssueReadScope).mockResolvedValue(
      buildIssueReadScope(
        {
          editorCommunityIds: [community.id],
          memberCommunityIds: [community.id],
        },
        [{ ...community, deletedAt: null }],
      ),
    );
    const result = await loadMagazineShelf(fx.deps, {
      magazineSlug: magazine.slug,
      viewerId: "editor-1",
      locale: "en",
    });
    expect(result!.viewerIsEditor).toBe(true);
    expect(result!.issues.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(result!.unpublishedForEditor).toBe(true);
  });
});
