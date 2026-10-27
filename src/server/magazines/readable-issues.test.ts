import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "@/server/communities/hub";

import { editorScopeOf } from "./editorship";
import {
  buildIssueReadScope,
  type IssueReadScope,
  issueReadScopeForCommunity,
  readableIssueWhere,
} from "./readable-issues";

function scope(partial: Partial<IssueReadScope>): IssueReadScope {
  return {
    editorCommunityIds: [],
    memberCommunityIds: [],
    privateCommunityIds: [],
    deletedCommunityIds: [],
    ...partial,
  };
}

const PUBLISHED = { status: { equals: "published" } };
const PUBLIC = { visibility: { equals: "public" } };

describe("issueReadScopeForCommunity", () => {
  const communities = [
    {
      label: "listed community",
      row: { id: "listed", slug: "listed", isListedInDirectory: true },
      privateCommunityIds: [],
    },
    {
      label: "unlisted community",
      row: { id: "unlisted", slug: "unlisted", isListedInDirectory: false },
      privateCommunityIds: ["unlisted"],
    },
    {
      label: "unlisted Hub",
      row: { id: "hub", slug: HUB_SLUG, isListedInDirectory: false },
      privateCommunityIds: [],
    },
  ];
  const standings = [
    { label: "editor", isEditor: true, isMember: true },
    { label: "member", isEditor: false, isMember: true },
    { label: "outsider", isEditor: false, isMember: false },
  ];

  it.each(
    communities.flatMap((community) =>
      standings.map((standing) => ({
        name: `${standing.label} in a live ${community.label}`,
        community,
        standing,
      })),
    ),
  )("builds the scope for $name", ({ community, standing }) => {
    expect(issueReadScopeForCommunity(standing, community.row)).toEqual({
      editorCommunityIds: standing.isEditor ? [community.row.id] : [],
      memberCommunityIds: standing.isMember ? [community.row.id] : [],
      privateCommunityIds: community.privateCommunityIds,
      deletedCommunityIds: [],
    });
  });
});

describe("readableIssueWhere", () => {
  it("anonymous scope: published, public, and listed or confirmed", () => {
    expect(
      readableIssueWhere(scope({ privateCommunityIds: ["c-priv"] })),
    ).toEqual({
      and: [
        PUBLISHED,
        PUBLIC,
        {
          or: [
            { communityId: { not_in: ["c-priv"] } },
            { publicConfirmedAt: { exists: true } },
          ],
        },
      ],
    });
  });

  it("with no private communities, every published public issue", () => {
    expect(readableIssueWhere(scope({}))).toEqual({
      and: [PUBLISHED, PUBLIC],
    });
  });

  it("omits empty id lists instead of emitting in: []", () => {
    const shapes = [
      scope({}),
      scope({ privateCommunityIds: ["p"] }),
      scope({ memberCommunityIds: ["m"] }),
      scope({ editorCommunityIds: ["e"] }),
      scope({ deletedCommunityIds: ["d"] }),
    ];
    for (const s of shapes) {
      const json = JSON.stringify(readableIssueWhere(s));
      expect(json).not.toContain('"in":[]');
      expect(json).not.toContain('"not_in":[]');
    }
  });

  it("members see published issues of their communities at any visibility", () => {
    expect(
      readableIssueWhere(
        scope({
          memberCommunityIds: ["c-mem"],
          privateCommunityIds: ["c-mem"],
        }),
      ),
    ).toEqual({
      and: [
        PUBLISHED,
        {
          or: [
            { communityId: { in: ["c-mem"] } },
            {
              and: [
                PUBLIC,
                {
                  or: [
                    { communityId: { not_in: ["c-mem"] } },
                    { publicConfirmedAt: { exists: true } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("editor communities see every status", () => {
    expect(
      readableIssueWhere(
        scope({
          editorCommunityIds: ["c-ed"],
          memberCommunityIds: ["c-ed"],
        }),
      ),
    ).toEqual({
      or: [
        { communityId: { in: ["c-ed"] } },
        {
          and: [PUBLISHED, { or: [{ communityId: { in: ["c-ed"] } }, PUBLIC] }],
        },
      ],
    });
  });

  it("soft-deleted communities are excluded before every other branch", () => {
    expect(
      readableIssueWhere(
        scope({
          editorCommunityIds: ["c-gone"],
          deletedCommunityIds: ["c-gone"],
        }),
      ),
    ).toEqual({
      and: [
        { communityId: { not_in: ["c-gone"] } },
        {
          or: [
            { communityId: { in: ["c-gone"] } },
            { and: [PUBLISHED, PUBLIC] },
          ],
        },
      ],
    });
  });
});

describe("buildIssueReadScope", () => {
  const listed = { id: "c-listed", slug: "listed", isListedInDirectory: true };
  const unlisted = { id: "c-unl", slug: "unl", isListedInDirectory: false };
  const hub = { id: "c-hub", slug: HUB_SLUG, isListedInDirectory: false };

  it("the Hub is content-public although it is unlisted", () => {
    const s = buildIssueReadScope(editorScopeOf([], []), [
      { ...hub, deletedAt: null },
      { ...unlisted, deletedAt: null },
      { ...listed, deletedAt: null },
    ]);
    expect(s.privateCommunityIds).toEqual(["c-unl"]);
    expect(s.deletedCommunityIds).toEqual([]);
  });

  it("takes the editor and member ids from the editorship seam", () => {
    const s = buildIssueReadScope(
      editorScopeOf(
        [
          { communityId: "a", role: "owner", status: "active" },
          { communityId: "d", role: "member", status: "active" },
        ],
        [],
      ),
      [],
    );
    expect(s.editorCommunityIds).toEqual(["a"]);
    expect(s.memberCommunityIds).toEqual(["a", "d"]);
  });

  it("a soft-deleted community is listed as deleted, listed or not", () => {
    const when = new Date("2026-01-01T00:00:00Z");
    const s = buildIssueReadScope(editorScopeOf([], []), [
      { ...listed, deletedAt: when },
      { ...hub, deletedAt: when },
    ]);
    expect(s.deletedCommunityIds).toEqual(["c-listed", "c-hub"]);
    expect(s.privateCommunityIds).toEqual([]);
  });
});
