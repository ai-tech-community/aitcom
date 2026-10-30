import type { SQL } from "drizzle-orm";
import { drizzle, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PICKER_LIMIT } from "@/lib/magazines/picker";
import type { LaunchpadProject } from "@/payload-types";

import { searchPickerCandidates } from "../pickers";
import { loadIssueItemViews } from "../registry";
import type { ItemContext, PickerContext } from "../types";
import { launchpadProjectItemKind } from "./kind";
import { communityProjectFilter } from "./scope";

const find = vi.fn();
const memberships = vi.fn();
const projectQuery = vi.fn<RemoteCallback>();
function context(access: ItemContext["access"] = "editor") {
  const database = drizzle(projectQuery, { casing: "snake_case" });
  const executeRows = database.execute.bind(database);
  return {
    payload: { find } as unknown as ItemContext["payload"],
    db: Object.assign(database, {
      execute: async (query: SQL) => ({ rows: await executeRows(query) }),
      query: { communityMemberships: { findMany: memberships } },
    }) as unknown as ItemContext["db"],
    magazineId: 1,
    issueId: 2,
    community: { id: "community", slug: "local-builders" },
    locale: "nl",
    access,
    reader: {
      viewerId: "editor",
      hiddenCommunityIds: vi.fn(async () => new Set(["hidden"])),
      membersOnlyCommunityIds: vi.fn(async () => new Set(["private"])),
    },
  } satisfies ItemContext;
}
const project = (
  id: number,
  overrides: Partial<LaunchpadProject> = {},
): LaunchpadProject => ({
  id,
  title: `Project ${id}`,
  slug: `project-${id}`,
  pitch: {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          version: 1,
          children: [{ type: "text", version: 1, text: "Build together" }],
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  },
  stage: "prototype",
  authorId: "member",
  authorName: "Sanne",
  status: "published",
  voteCount: 120,
  communityId: "community",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});
const stored = (projectId: number, id = `block-${projectId}`) => ({
  id,
  projectId,
  intro: "Our take",
});
const pickerContext = (): PickerContext => {
  const ctx = context();
  return {
    deps: { db: ctx.db, payload: ctx.payload },
    magazineId: 1,
    community: ctx.community,
    viewerId: "editor",
    locale: "nl",
  };
};
beforeEach(() => {
  find.mockReset().mockResolvedValue({ docs: [] });
  projectQuery.mockReset().mockResolvedValue({ rows: [{ id: 3 }] });
  memberships.mockReset().mockResolvedValue([{ userId: "member" }]);
});

describe("launchpad project item kind", () => {
  it("loads every project of an issue in one query", async () => {
    find.mockResolvedValue({
      docs: [
        project(1, {
          id: "1" as unknown as number,
          voteCount: "120" as unknown as number,
        }),
        project(2, { voteCount: null, authorName: null }),
      ],
    });
    const views = await launchpadProjectItemKind.load(
      [stored(1), stored(2), stored(3)],
      context(),
    );
    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: "launchpad-projects",
      where: { id: { in: [1, 2, 3] } },
      depth: 0,
      locale: "nl",
      pagination: false,
    });
    expect(views.get("block-1")).toMatchObject({
      project: {
        title: "Project 1",
        voteCount: 120,
        authorName: "Sanne",
        stage: "prototype",
      },
    });
    expect(views.get("block-2")).toMatchObject({
      project: { voteCount: 0, authorName: null },
    });
    expect(views.get("block-3")).toMatchObject({ reason: "missing" });
    expect(memberships).not.toHaveBeenCalled();
  });

  it("draft and archived projects are unpublished, private ones no_access", async () => {
    find.mockResolvedValue({
      docs: [
        project(1, { status: "draft" }),
        project(2, { status: "archived" }),
        project(3, { communityId: "hidden" }),
        project(4, { communityId: null }),
      ],
    });
    const blocks = [1, 2, 3, 4, 5].map((n) => ({
      blockType: "launchpadProject" as const,
      ...stored(n),
    }));
    const editorViews = await loadIssueItemViews(blocks, context());
    expect(editorViews.slice(0, 3)).toEqual(
      ["unpublished", "unpublished", "no_access"].map((reason, i) => ({
        kind: "launchpadProject",
        itemId: `block-${i + 1}`,
        unavailable: true,
        reason,
      })),
    );
    expect(editorViews[4]).toMatchObject({ reason: "missing" });
    expect(await loadIssueItemViews(blocks, context("full"))).toMatchObject([
      { kind: "launchpadProject", itemId: "block-4", membersOnly: false },
    ]);
  });

  it("flags members-only projects through the shared community rule", async () => {
    find.mockResolvedValue({
      docs: [
        project(1, { communityId: "private" }),
        project(2, { communityId: null }),
      ],
    });
    const views = await launchpadProjectItemKind.load(
      [stored(1), stored(2)],
      context(),
    );
    expect(views.get("block-1")).toMatchObject({ membersOnly: true });
    expect(views.get("block-2")).toMatchObject({ membersOnly: false });
    const ctx = context("full");
    expect(
      (await launchpadProjectItemKind.load([stored(1)], ctx)).get("block-1"),
    ).toMatchObject({ membersOnly: false });
    expect(ctx.reader.membersOnlyCommunityIds).not.toHaveBeenCalled();
  });

  it("refuses a project outside the community", async () => {
    find.mockResolvedValue({
      docs: [
        project(1, { communityId: null, authorId: "outsider" }),
        project(2, { communityId: "other" }),
        project(3, { communityId: null }),
        project(4),
        project(5, { status: "draft" }),
        project(6, { status: "archived" }),
        project(7, { communityId: "hidden" }),
      ],
    });
    const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n, index) => ({
      index,
      stored: stored(n),
      isNew: true,
    }));
    expect(await launchpadProjectItemKind.validate(items, context())).toEqual(
      [0, 1, 4, 5, 6, 7].map((itemIndex) => ({
        itemIndex,
        code: "ITEM_INVALID",
      })),
    );
    expect(find).toHaveBeenCalledTimes(1);
    expect(memberships).toHaveBeenCalledTimes(1);
    expect(
      await launchpadProjectItemKind.validate(
        items.map((i) => ({ ...i, isNew: false })),
        context(),
      ),
    ).toEqual([]);
    expect(
      await launchpadProjectItemKind.validate(
        [items[3]!, { ...items[3]!, index: 8 }],
        context(),
      ),
    ).toEqual([{ itemIndex: 8, code: "ITEM_INVALID", detail: "duplicate" }]);
  });

  it("checks membership for a whole batch in one query", async () => {
    const ctx = context();
    const projects = [
      project(1, { communityId: null }),
      project(2, { communityId: null, authorId: "outsider" }),
      project(3),
      project(4, { communityId: "other" }),
      {},
    ];
    const accept = await communityProjectFilter(ctx, ctx.community, projects);
    expect(projects.map(accept)).toEqual([true, false, true, false, false]);
    expect(memberships).toHaveBeenCalledTimes(1);
    memberships.mockClear();
    for (const batch of [
      [],
      [project(1)],
      [project(1, { communityId: "other" })],
      [{}],
    ])
      await communityProjectFilter(ctx, ctx.community, batch);
    expect(memberships).not.toHaveBeenCalled();
  });

  it("shows the pitch as plain text", async () => {
    const doc = project(1);
    doc.pitch.root.children = [
      {
        type: "paragraph",
        version: 1,
        children: [
          {
            type: "text",
            version: 1,
            text: "One two three four five six seven eight nine ten ",
          },
          {
            type: "link",
            version: 1,
            children: [
              {
                type: "text",
                version: 1,
                text: "eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty ",
              },
            ],
          },
          {
            type: "text",
            version: 1,
            text: "twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five thirty-six thirty-seven thirty-eight thirty-nine forty forty-one",
          },
        ],
      },
    ];
    find.mockResolvedValue({ docs: [doc] });
    expect(
      (await launchpadProjectItemKind.load([stored(1)], context())).get(
        "block-1",
      ),
    ).toMatchObject({
      project: {
        pitch:
          "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five thirty-six thirty-seven thirty-eight thirty-nine forty…",
      },
    });
  });

  it("round-trips numeric ids and keeps the intro", () => {
    const saved = launchpadProjectItemKind.toStored({
      kind: "launchpadProject",
      projectId: 7,
      intro: " Our take ",
    });
    expect(saved).toEqual({ projectId: 7, intro: "Our take" });
    const fromPayload = { ...saved, projectId: "7" as unknown as number };
    expect(launchpadProjectItemKind.toInput(fromPayload)).toEqual({
      kind: "launchpadProject",
      projectId: 7,
      intro: "Our take",
    });
    expect(launchpadProjectItemKind.referenceOf(fromPayload)).toBe(
      "launchpadProject:7",
    );
    for (const projectId of [0, -1, 1.5])
      expect(
        launchpadProjectItemKind.input.safeParse({
          kind: "launchpadProject",
          projectId,
        }).success,
      ).toBe(false);
  });
});

describe("launchpad project picker", () => {
  it("limits projects scoped to this community and its active members and formats facts", async () => {
    find.mockResolvedValue({
      docs: [
        project(2, { voteCount: "120" as unknown as number }),
        ...Array.from({ length: PICKER_LIMIT - 1 }, (_, i) =>
          project(i + 3, {
            communityId: null,
            voteCount: null,
            authorName: null,
          }),
        ),
      ],
    });
    const ctx = pickerContext();
    const candidates = await searchPickerCandidates(
      "launchpadProject",
      "",
      ctx,
    );
    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: "launchpad-projects",
      where: {
        and: [
          { status: { equals: "published" } },
          {
            or: [
              { communityId: { equals: "community" } },
              {
                and: [{ communityId: { exists: false } }, { id: { in: [3] } }],
              },
            ],
          },
        ],
      },
      sort: "-voteCount",
      depth: 0,
      locale: "nl",
      limit: PICKER_LIMIT,
    });
    expect(candidates).toHaveLength(PICKER_LIMIT);
    expect(candidates[0]).toEqual({
      input: { kind: "launchpadProject", projectId: 2 },
      reference: "launchpadProject:2",
      title: "Project 2",
      facts: [
        { type: "count", what: "upvotes", value: 120 },
        { type: "byline", name: "Sanne" },
      ],
      openHref: null,
    });
    expect(candidates[1]!.facts).toEqual([
      { type: "count", what: "upvotes", value: 0 },
    ]);
    expect(memberships).not.toHaveBeenCalled();
    await searchPickerCandidates("launchpadProject", "models", ctx);
    expect(find.mock.lastCall![0].where.and).toContainEqual({
      title: { like: "models" },
    });
  });

  it("only offers community projects when there are no active members", async () => {
    projectQuery.mockResolvedValue({ rows: [] });
    find.mockResolvedValue({
      docs: [project(1, { authorId: "outsider" })],
    });

    const candidates = await searchPickerCandidates(
      "launchpadProject",
      "",
      pickerContext(),
    );

    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: "launchpad-projects",
      where: {
        and: [
          { status: { equals: "published" } },
          { or: [{ communityId: { equals: "community" } }] },
        ],
      },
      sort: "-voteCount",
      depth: 0,
      locale: "nl",
      limit: PICKER_LIMIT,
    });
    expect(candidates.map((candidate) => candidate.reference)).toEqual([
      "launchpadProject:1",
    ]);
    expect(memberships).not.toHaveBeenCalled();
  });
});
