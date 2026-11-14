// @vitest-environment node
/**
 * DB-INTEGRATION test for profile photos: against a REAL local DB + Payload,
 * an upload becomes the member's picture, a new one replaces (and deletes)
 * the old one, two uploads at once settle on the newest, and removing takes
 * the picture and every upload away. Also applies the migration that adds
 * the `avatar` purpose.
 *
 * S3 is never called: every S3 command the storage adapter sends is caught
 * and recorded.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     S3_BUCKET=local-test-bucket S3_ACCESS_KEY_ID=AKIAFAKELOCALONLY0000 \
 *     S3_SECRET_ACCESS_KEY=fake-local-only-secret \
 *     pnpm exec vitest run src/server/members/profile-photo.integration.test.ts
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Drizzle from "drizzle-orm";
import type { Payload } from "payload";

import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";

import type { deleteMemberAccount as DeleteMemberAccount } from "./delete-account";
import type * as ProfilePhoto from "./profile-photo";
import type { sweepUnusedProfilePhotos as SweepUnusedProfilePhotos } from "./unused-profile-photos-sweep";

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

type S3Call = { command: string; key: string };

describe.skipIf(!RUN_DB)("profile photos [DB integration]", () => {
  let payload: Payload;
  let db: typeof Db;
  let m: typeof ProfilePhoto;
  let sweep: typeof SweepUnusedProfilePhotos;
  let deleteMemberAccount: typeof DeleteMemberAccount;
  let schema: typeof Schema;
  let drizzle: typeof Drizzle;
  let big: Buffer;
  let small: Buffer;
  const calls: S3Call[] = [];
  const users: string[] = [];

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ S3 }, payloadModule, dbModule, sharp, migration] =
      await Promise.all([
        import("@aws-sdk/client-s3"),
        import("@/server/payload"),
        import("@/server/db"),
        import("sharp"),
        import("@/migrations/20261114d_media_avatar_purpose"),
      ]);
    let sweepModule, deleteModule;
    [m, schema, drizzle, sweepModule, deleteModule] = await Promise.all([
      import("./profile-photo"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("./unused-profile-photos-sweep"),
      import("./delete-account"),
    ]);
    sweep = sweepModule.sweepUnusedProfilePhotos;
    deleteMemberAccount = deleteModule.deleteMemberAccount;
    // The storage adapter's only way out to S3. Record and answer locally.
    vi.spyOn(S3.prototype, "send").mockImplementation(((command: {
      constructor: { name: string };
      input: { Key?: string };
    }) => {
      calls.push({
        command: command.constructor.name,
        key: command.input.Key ?? "",
      });
      return Promise.resolve({});
    }) as never);
    payload = await payloadModule.getPayloadClient();
    db = dbModule.db;
    await migration.up({ db: payload.db.drizzle } as never);

    const picture = (size: number) =>
      sharp
        .default({
          create: {
            width: size,
            height: size,
            channels: 3,
            background: "#336699",
          },
        })
        .png()
        .toBuffer();
    [big, small] = await Promise.all([picture(600), picture(100)]);
  }, 120_000);

  afterEach(async () => {
    for (const id of users) {
      await db.execute(
        drizzle.sql`DELETE FROM "media" WHERE "uploaded_by" = ${id}`,
      );
      await db.delete(schema.user).where(drizzle.eq(schema.user.id, id));
    }
    users.length = 0;
    calls.length = 0;
  });

  async function member(image: string | null = null): Promise<string> {
    const id = `it-photo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await db.insert(schema.user).values({
      id,
      email: `${id}@example.test`,
      name: "Photo Tester",
      image,
    });
    users.push(id);
    return id;
  }

  const deps = () => ({ db, payload: payload as never, log: vi.fn() });

  async function imageOf(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ image: schema.user.image })
      .from(schema.user)
      .where(drizzle.eq(schema.user.id, userId));
    return row?.image ?? null;
  }

  async function photosOf(userId: string) {
    const res = await db.execute(drizzle.sql`
      SELECT "id", "purpose", "filename", "prefix", "url", "sizes_thumbnail_url"
      FROM "media" WHERE "uploaded_by" = ${userId} ORDER BY "id"`);
    return res.rows as {
      id: number;
      purpose: string;
      filename: string;
      prefix: string;
      url: string | null;
      sizes_thumbnail_url: string | null;
    }[];
  }

  /** A profile photo row with no file, uploaded `hoursAgo`, shown by no one. */
  async function strayPhoto(userId: string, hoursAgo: number) {
    const name = `avatar-it-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
    const res = await db.execute(drizzle.sql`
      INSERT INTO "media" ("alt", "filename", "prefix", "url", "purpose", "uploaded_by", "updated_at", "created_at")
      VALUES ('Profile photo', ${name}, 'media', ${"https://x.test/media/" + name},
        'avatar', ${userId}, now(), now() - make_interval(hours => ${hoursAgo}))
      RETURNING "id"`);
    return Number((res.rows[0] as { id: number }).id);
  }

  async function backdate(userId: string, hours: number) {
    await db.execute(drizzle.sql`
      UPDATE "media" SET "created_at" = now() - make_interval(hours => ${hours})
      WHERE "uploaded_by" = ${userId}`);
  }

  it("shows an upload as the member's picture: its square crop, stored under media/", async () => {
    const userId = await member("https://avatars.githubusercontent.com/u/1");
    const result = await m.setProfilePhoto(deps(), { userId, data: big });

    const [stored] = await photosOf(userId);
    expect(stored).toMatchObject({ purpose: "avatar", prefix: "media" });
    expect(stored!.filename).toMatch(/^avatar-[0-9a-f-]{36}\.png$/);
    expect(stored!.sizes_thumbnail_url).toMatch(
      /\/media\/avatar-.+-300x300\.png$/,
    );
    expect(result.image).toBe(stored!.sizes_thumbnail_url);
    expect(await imageOf(userId)).toBe(stored!.sizes_thumbnail_url);
    expect(
      calls
        .filter((c) => c.command === "PutObjectCommand")
        .every((c) => c.key.startsWith("media/avatar-")),
    ).toBe(true);
  });

  it("shows a picture smaller than the crop as it is", async () => {
    const userId = await member();
    await m.setProfilePhoto(deps(), { userId, data: small });
    const [stored] = await photosOf(userId);
    expect(await imageOf(userId)).toBe(
      stored!.sizes_thumbnail_url ?? stored!.url,
    );
  });

  it("replaces the old photo and deletes its files", async () => {
    const userId = await member();
    await m.setProfilePhoto(deps(), { userId, data: big });
    const [first] = await photosOf(userId);
    calls.length = 0;

    await m.setProfilePhoto(deps(), { userId, data: big });

    const photos = await photosOf(userId);
    expect(photos).toHaveLength(1);
    expect(photos[0]!.id).toBeGreaterThan(first!.id);
    expect(await imageOf(userId)).toBe(photos[0]!.sizes_thumbnail_url);
    expect(
      calls
        .filter((c) => c.command === "DeleteObjectCommand")
        .map((c) => c.key),
    ).toContain(`media/${first!.filename}`);
  });

  it("settles two uploads at once on the newest, keeping only it", async () => {
    const userId = await member();
    await Promise.all([
      m.setProfilePhoto(deps(), { userId, data: big }),
      m.setProfilePhoto(deps(), { userId, data: big }),
    ]);
    const photos = await photosOf(userId);
    expect(photos).toHaveLength(1);
    expect(await imageOf(userId)).toBe(photos[0]!.sizes_thumbnail_url);
  });

  it("removes the picture, a sign-in one too, and every upload", async () => {
    const userId = await member();
    await m.setProfilePhoto(deps(), { userId, data: big });

    await m.removeProfilePhoto(deps(), userId);

    expect(await imageOf(userId)).toBeNull();
    expect(await photosOf(userId)).toEqual([]);
  });

  it("deletes the photos after an account deletion, and stores none from a late upload", async () => {
    const userId = await member();
    await m.setProfilePhoto(deps(), { userId, data: big });

    await deleteMemberAccount(db, userId);
    await m.removeProfilePhoto(deps(), userId);
    expect(await photosOf(userId)).toEqual([]);

    // An upload from a tab still open when the account went.
    await expect(
      m.setProfilePhoto(deps(), { userId, data: big }),
    ).resolves.toEqual({ image: null });
    expect(await imageOf(userId)).toBeNull();
    expect(await photosOf(userId)).toEqual([]);
  });

  describe("unused profile photos sweep", () => {
    it("deletes old photos no member shows and keeps the shown and the young", async () => {
      const userId = await member();
      await m.setProfilePhoto(deps(), { userId, data: big });
      await backdate(userId, 5);
      const [shown] = await photosOf(userId);
      const stray = await strayPhoto(userId, 5);
      const young = await strayPhoto(userId, 0);

      const result = await sweep({ db, payload: payload as never });

      expect(result.failed).toBe(0);
      expect(result.removed).toBeGreaterThanOrEqual(1);
      const left = (await photosOf(userId)).map((p) => p.id);
      expect(left).toContain(shown!.id);
      expect(left).toContain(young);
      expect(left).not.toContain(stray);
    });

    it("deletes the photos of a deleted account", async () => {
      const userId = await member();
      await m.setProfilePhoto(deps(), { userId, data: big });
      await backdate(userId, 5);
      // The account deletion's own cleanup failed (S3 down).
      await deleteMemberAccount(db, userId);

      await sweep({ db, payload: payload as never });

      expect(await photosOf(userId)).toEqual([]);
    });

    it("leaves other uploads alone", async () => {
      const userId = await member();
      const res = await db.execute(drizzle.sql`
        INSERT INTO "media" ("alt", "filename", "purpose", "uploaded_by", "updated_at", "created_at")
        VALUES ('x', ${`it-shared-${Date.now()}.png`}, NULL, ${userId}, now(), now() - interval '5 hours')
        RETURNING "id"`);
      const shared = Number((res.rows[0] as { id: number }).id);

      await sweep({ db, payload: payload as never });

      expect((await photosOf(userId)).map((p) => p.id)).toContain(shared);
    });
  });
});
