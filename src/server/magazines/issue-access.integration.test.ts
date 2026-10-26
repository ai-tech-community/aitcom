// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { PayloadClient } from "./deps";
import type * as Access from "./issue-access";
import type * as Readable from "./readable-issues";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

/**
 * Parity between the issue read rule's two forms (ADR-0042): the resolver
 * (`loadMagazineIssueAccess`, one issue at a time) and its query twin
 * (`readableIssueWhere`, a Payload `where`). The Hub row, the one rule the
 * two forms implement differently, is pinned by the `buildIssueReadScope`
 * unit test: a Hub slug is unique, so a DB fixture cannot create one.
 */
describe.skipIf(!RUN_DB)(
  "magazine issue access parity [DB integration]",
  () => {
    type Mods = {
      db: typeof Db;
      schema: typeof Schema;
      access: typeof Access;
      readable: typeof Readable;
      payload: PayloadClient;
    };
    let m: Mods;

    type Issue = {
      id: number;
      label: string;
      communityId: string;
      status: string;
      visibility: string;
      publicConfirmedAt: string | null;
    };
    type Fixture = {
      sfx: string;
      users: {
        creator: string;
        outsider: string;
        unlistedMember: string;
        unlistedAdmin: string;
        unlistedPending: string;
        unlistedBanned: string;
        deletedAdmin: string;
      };
      communities: { listed: string; unlisted: string; deleted: string };
      magazineIds: number[];
      issues: Issue[];
    };
    let fx: Fixture;

    beforeAll(async () => {
      const [{ db }, schema, access, readable, { getPayloadClient }] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("./issue-access"),
          import("./readable-issues"),
          import("@/server/payload"),
        ]);
      m = { db, schema, access, readable, payload: await getPayloadClient() };
    }, 120_000);

    beforeEach(async () => {
      const { db, schema } = m;
      const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const users = {
        creator: `mia-creator-${sfx}`,
        outsider: `mia-outsider-${sfx}`,
        unlistedMember: `mia-member-${sfx}`,
        unlistedAdmin: `mia-admin-${sfx}`,
        unlistedPending: `mia-pending-${sfx}`,
        unlistedBanned: `mia-banned-${sfx}`,
        deletedAdmin: `mia-deleted-admin-${sfx}`,
      };
      await db.insert(schema.user).values(
        Object.values(users).map((id) => ({
          id,
          email: `${id}@example.test`,
          name: id,
        })),
      );

      async function community(
        label: string,
        listed: boolean,
        deleted = false,
      ) {
        const [row] = await db
          .insert(schema.communities)
          .values({
            name: `Magazine access ${label} ${sfx}`,
            slug: `mia-${label}-${sfx}`,
            isListedInDirectory: listed,
            createdBy: users.creator,
            deletedAt: deleted ? new Date() : null,
          })
          .returning();
        return row!.id;
      }
      const communities = {
        listed: await community("listed", true),
        unlisted: await community("unlisted", false),
        deleted: await community("deleted", true, true),
      };

      await db.insert(schema.communityMemberships).values([
        {
          communityId: communities.unlisted,
          userId: users.unlistedMember,
          role: "member",
        },
        {
          communityId: communities.unlisted,
          userId: users.unlistedAdmin,
          role: "admin",
        },
        {
          communityId: communities.unlisted,
          userId: users.unlistedPending,
          role: "member",
          status: "pending_approval",
        },
        {
          communityId: communities.unlisted,
          userId: users.unlistedBanned,
          role: "admin",
          status: "banned",
        },
        {
          communityId: communities.deleted,
          userId: users.deletedAdmin,
          role: "owner",
        },
      ]);

      fx = { sfx, users, communities, magazineIds: [], issues: [] };

      async function magazine(label: string, communityId: string) {
        const doc = await m.payload.create({
          collection: "magazines",
          data: {
            name: `Magazine ${label} ${sfx}`,
            slug: `mia-${label}-${sfx}`,
            communityId,
            createdBy: users.creator,
          },
        });
        fx.magazineIds.push(doc.id);
        return doc.id;
      }

      const confirmedAt = new Date("2026-10-01T00:00:00Z").toISOString();
      async function issues(
        label: keyof Fixture["communities"],
        combos: Array<{
          status: "draft" | "published";
          visibility: "members" | "public";
          confirmed: boolean;
        }>,
      ) {
        const communityId = communities[label];
        const magazineId = await magazine(label, communityId);
        let number = 0;
        for (const { status, visibility, confirmed } of combos) {
          number += 1;
          const name = `${label}-${status}-${visibility}-${confirmed ? "confirmed" : "unconfirmed"}`;
          const doc = await m.payload.create({
            collection: "magazine-issues",
            data: {
              magazine: magazineId,
              communityId,
              number,
              title: name,
              slug: name,
              status,
              visibility,
              publicConfirmedBy: confirmed ? users.creator : null,
              publicConfirmedAt: confirmed ? confirmedAt : null,
            },
          });
          fx.issues.push({
            id: doc.id,
            label: name,
            communityId,
            status,
            visibility,
            publicConfirmedAt: confirmed ? confirmedAt : null,
          });
        }
      }

      const every = (["draft", "published"] as const).flatMap((status) =>
        (["members", "public"] as const).flatMap((visibility) =>
          [false, true].map((confirmed) => ({ status, visibility, confirmed })),
        ),
      );
      await issues("listed", every);
      await issues("unlisted", every);
      await issues("deleted", [
        { status: "published", visibility: "public", confirmed: false },
      ]);
    }, 60_000);

    afterEach(async () => {
      const { db, schema } = m;
      const { inArray } = await import("drizzle-orm");
      await m.payload.delete({
        collection: "magazine-issues",
        where: { id: { in: fx.issues.map((i) => i.id) } },
      });
      await m.payload.delete({
        collection: "magazines",
        where: { id: { in: fx.magazineIds } },
      });
      const communityIds = Object.values(fx.communities);
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.communityId, communityIds));
      await db
        .delete(schema.communities)
        .where(inArray(schema.communities.id, communityIds));
      await db
        .delete(schema.user)
        .where(inArray(schema.user.id, Object.values(fx.users)));
    });

    async function readableByQuery(viewerId: string | null): Promise<string[]> {
      const scope = await m.readable.loadIssueReadScope(m.db, viewerId);
      const ids = await m.readable.readableIssueIds(m.payload, scope, {
        id: { in: fx.issues.map((i) => i.id) },
      });
      const byId = new Map(fx.issues.map((i) => [i.id, i.label]));
      return ids.map((id) => byId.get(id)!).sort();
    }

    async function readableByResolver(
      viewerId: string | null,
    ): Promise<string[]> {
      const labels: string[] = [];
      for (const issue of fx.issues) {
        const access = await m.access.loadMagazineIssueAccess(
          m.db,
          issue,
          viewerId,
        );
        if (access !== "none") labels.push(issue.label);
      }
      return labels.sort();
    }

    it("readableIssueWhere returns exactly the issues the resolver lets each viewer read", async () => {
      const u = fx.users;
      const publicOnly = [
        "listed-published-public-confirmed",
        "listed-published-public-unconfirmed",
        "unlisted-published-public-confirmed",
      ];
      // The resolver's own rules are unit-tested; these counts pin the
      // matrix so both forms cannot agree on a wrong answer.
      const expected: Array<[string, string | null, string[]]> = [
        ["anonymous", null, publicOnly],
        ["outsider", u.outsider, publicOnly],
        ["pending member (outsider)", u.unlistedPending, publicOnly],
        ["banned admin (outsider)", u.unlistedBanned, publicOnly],
        ["admin of a soft-deleted community", u.deletedAdmin, publicOnly],
        [
          "member of the unlisted community",
          u.unlistedMember,
          [
            "listed-published-public-confirmed",
            "listed-published-public-unconfirmed",
            "unlisted-published-members-confirmed",
            "unlisted-published-members-unconfirmed",
            "unlisted-published-public-confirmed",
            "unlisted-published-public-unconfirmed",
          ],
        ],
        [
          "admin of the unlisted community",
          u.unlistedAdmin,
          [
            "listed-published-public-confirmed",
            "listed-published-public-unconfirmed",
            ...fx.issues
              .filter((i) => i.communityId === fx.communities.unlisted)
              .map((i) => i.label),
          ],
        ],
      ];

      for (const [who, viewerId, labels] of expected) {
        const byResolver = await readableByResolver(viewerId);
        const byQuery = await readableByQuery(viewerId);
        expect(byQuery, `${who}: query vs resolver`).toEqual(byResolver);
        expect(byResolver, `${who}: expected set`).toEqual([...labels].sort());
      }
    }, 60_000);

    it("listed→unlisted: an unconfirmed public issue disappears for outsiders in both forms", async () => {
      const { eq } = await import("drizzle-orm");
      const unconfirmed = fx.issues.find(
        (i) => i.label === "listed-published-public-unconfirmed",
      )!;
      const confirmed = fx.issues.find(
        (i) => i.label === "listed-published-public-confirmed",
      )!;

      for (const viewerId of [null, fx.users.outsider]) {
        expect(await readableByQuery(viewerId)).toContain(unconfirmed.label);
      }

      await m.db
        .update(m.schema.communities)
        .set({ isListedInDirectory: false })
        .where(eq(m.schema.communities.id, fx.communities.listed));

      for (const viewerId of [null, fx.users.outsider]) {
        const byQuery = await readableByQuery(viewerId);
        expect(byQuery).not.toContain(unconfirmed.label);
        expect(byQuery).toContain(confirmed.label);
        expect(
          await m.access.loadMagazineIssueAccess(m.db, unconfirmed, viewerId),
        ).toBe("none");
        expect(
          await m.access.loadMagazineIssueAccess(m.db, confirmed, viewerId),
        ).toBe("full");
        expect(byQuery).toEqual(await readableByResolver(viewerId));
      }
    }, 60_000);
  },
);
