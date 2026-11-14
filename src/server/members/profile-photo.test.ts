// @vitest-environment node
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import type { Media } from "@/payload-types";
import { deletedAccountEmail } from "@/server/members/delete-account";

import {
  PROFILE_PHOTO_ALT,
  PROFILE_PHOTO_MAX_SIDE,
  ProfilePhotoRejectedError,
  photoUrl,
  prepareProfilePhoto,
  removeProfilePhoto,
  setProfilePhoto,
} from "./profile-photo";

const USER = "user-a";

function picture(
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp" | "gif" = "png",
) {
  return sharp({
    create: { width, height, channels: 3, background: "#336699" },
  })
    .toFormat(format)
    .toBuffer();
}

let png: Buffer;
beforeAll(async () => {
  png = await picture(40, 40);
});

function photo(
  id: number,
  thumbnail: string | null = `https://s3/t${id}.jpg`,
): Media {
  return {
    id,
    url: `https://s3/p${id}.jpg`,
    sizes: { thumbnail: { url: thumbnail } },
  } as unknown as Media;
}

/** A database whose transaction records what it ran, holding one user. */
function fakeDb(initialImage: string | null = "https://github/ada.png") {
  const state = {
    image: initialImage,
    email: "ada@example.com",
    locks: [] as unknown[],
    inTx: false,
  };
  const tx = {
    execute: vi.fn(async (query: unknown) => {
      state.locks.push(query);
    }),
    update: vi.fn(() => ({
      set: (values: { image: string | null }) => ({
        where: async () => {
          state.image = values.image;
        },
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ image: state.image, email: state.email }],
        }),
      }),
    })),
  };
  const db = {
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      state.inTx = true;
      try {
        return await fn(tx);
      } finally {
        state.inTx = false;
      }
    }),
  };
  return { db, state };
}

/** Payload holding the member's photos; `find` returns them newest first. */
function fakePayload(existing: Media[] = []) {
  const photos = [...existing];
  let nextId = Math.max(0, ...existing.map((p) => p.id)) + 1;
  const payload = {
    create: vi.fn(async (_args: unknown) => {
      const created = photo(nextId++);
      photos.push(created);
      return created;
    }),
    find: vi.fn(async () => ({
      docs: [...photos].sort((a, b) => b.id - a.id),
    })),
    delete: vi.fn(async ({ id }: { id: number }) => {
      const index = photos.findIndex((p) => p.id === id);
      if (index >= 0) photos.splice(index, 1);
      return {};
    }),
  };
  return { payload, photos };
}

beforeEach(() => vi.clearAllMocks());

describe("prepareProfilePhoto", () => {
  it("refuses what is not a JPEG, PNG, WebP or GIF, whatever it claims to be", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    for (const data of [svg, Buffer.from("not a picture"), Buffer.alloc(0)]) {
      await expect(prepareProfilePhoto(data)).rejects.toEqual(
        new ProfilePhotoRejectedError("type"),
      );
    }
    const tiff = await picture(10, 10).then((b) => sharp(b).tiff().toBuffer());
    await expect(prepareProfilePhoto(tiff)).rejects.toMatchObject({
      reason: "type",
    });
  });

  it("refuses a file over the upload limit", async () => {
    await expect(
      prepareProfilePhoto(Buffer.alloc(MAX_IMAGE_BYTES + 1)),
    ).rejects.toMatchObject({ reason: "size" });
  });

  it("keeps the picture's real type", async () => {
    for (const [format, extension] of [
      ["png", "png"],
      ["jpeg", "jpg"],
      ["webp", "webp"],
      ["gif", "gif"],
    ] as const) {
      const prepared = await prepareProfilePhoto(await picture(20, 20, format));
      expect(prepared).toMatchObject({
        mimetype: `image/${format}`,
        extension,
      });
      expect((await sharp(prepared.data).metadata()).format).toBe(format);
    }
  });

  it("drops the file's metadata and keeps the picture upright", async () => {
    // A phone photo: 40×20 pixels, EXIF says turn it a quarter (6), and
    // EXIF fields such as where it was taken.
    const phone = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#336699" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Copyright: "Ada at home" } })
      .toBuffer();
    expect((await sharp(phone).metadata()).exif).toBeDefined();

    const prepared = await prepareProfilePhoto(phone);
    const meta = await sharp(prepared.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it("brings a large picture down to the longest side we keep", async () => {
    const prepared = await prepareProfilePhoto(await picture(2000, 1000));
    const meta = await sharp(prepared.data).metadata();
    expect([meta.width, meta.height]).toEqual([
      PROFILE_PHOTO_MAX_SIDE,
      PROFILE_PHOTO_MAX_SIDE / 2,
    ]);
  });
});

describe("setProfilePhoto", () => {
  it("uploads nothing when the picture is refused", async () => {
    const { db } = fakeDb();
    const { payload } = fakePayload();
    await expect(
      setProfilePhoto(
        { db: db as never, payload: payload as never },
        { userId: USER, data: Buffer.from("<svg/>") },
      ),
    ).rejects.toBeInstanceOf(ProfilePhotoRejectedError);
    expect(payload.create).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("stores the prepared picture as the member's own photo under a random name", async () => {
    const { db } = fakeDb();
    const { payload } = fakePayload();
    await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, data: png },
    );
    expect(payload.create).toHaveBeenCalledWith({
      collection: "media",
      data: { alt: PROFILE_PHOTO_ALT, uploadedBy: USER, purpose: "avatar" },
      file: expect.objectContaining({
        mimetype: "image/png",
        name: expect.stringMatching(/^avatar-[0-9a-f-]{36}\.png$/),
      }),
    });
  });

  it("shows the new photo's square crop and deletes the older photos", async () => {
    const { db, state } = fakeDb();
    const { payload, photos } = fakePayload([photo(3), photo(5)]);
    const result = await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, data: png },
    );
    expect(result).toEqual({ image: "https://s3/t6.jpg" });
    expect(state.image).toBe("https://s3/t6.jpg");
    expect(photos.map((p) => p.id)).toEqual([6]);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [
            { uploadedBy: { equals: USER } },
            { purpose: { equals: "avatar" } },
          ],
        },
      }),
    );
  });

  it("takes the member's lock and deletes inside it", async () => {
    const { db, state } = fakeDb();
    const { payload } = fakePayload([photo(1)]);
    const inTxAtDelete: boolean[] = [];
    payload.delete.mockImplementation(async () => {
      inTxAtDelete.push(state.inTx);
      return {};
    });
    await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, data: png },
    );
    expect(state.locks).toHaveLength(1);
    expect(JSON.stringify(state.locks[0])).toContain(`profile-photo:${USER}`);
    expect(inTxAtDelete).toEqual([true]);
  });

  it("shows the newest upload when another one landed meanwhile", async () => {
    const { db, state } = fakeDb();
    const { payload, photos } = fakePayload();
    // Another tab's upload is stored after this one, before this one settles.
    payload.create.mockImplementationOnce(async () => {
      photos.push(photo(1), photo(2));
      return photo(1);
    });
    await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, data: png },
    );
    expect(state.image).toBe("https://s3/t2.jpg");
    expect(photos.map((p) => p.id)).toEqual([2]);
  });

  it("reports no picture when a remove in another tab settled first", async () => {
    const { db, state } = fakeDb(null);
    const { payload, photos } = fakePayload();
    // The remove settled first and deleted this upload.
    payload.create.mockImplementationOnce(async () => photo(1));
    const result = await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, data: png },
    );
    expect(result).toEqual({ image: null });
    expect(state.image).toBeNull();
    expect(photos).toEqual([]);
  });

  it("stores no picture on a deleted account and deletes the upload", async () => {
    const { db, state } = fakeDb(null);
    state.email = deletedAccountEmail(USER);
    const { payload, photos } = fakePayload();
    const result = await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, data: png },
    );
    expect(result).toEqual({ image: null });
    expect(state.image).toBeNull();
    expect(photos).toEqual([]);
  });

  it("logs a photo that fails to delete and still shows the new one", async () => {
    const { db, state } = fakeDb();
    const { payload } = fakePayload([photo(1)]);
    payload.delete.mockRejectedValueOnce(new Error("s3 down"));
    const log = vi.fn();
    await setProfilePhoto(
      { db: db as never, payload: payload as never, log },
      { userId: USER, data: png },
    );
    expect(state.image).toBe("https://s3/t2.jpg");
    expect(log).toHaveBeenCalledWith(
      "[profile-photo] deleting a photo failed",
      expect.objectContaining({ mediaId: 1 }),
    );
  });
});

describe("removeProfilePhoto", () => {
  it("clears the picture, a sign-in provider's one too, and deletes every upload", async () => {
    const { db, state } = fakeDb("https://github/ada.png");
    const { payload, photos } = fakePayload([photo(1), photo(2)]);
    await removeProfilePhoto(
      { db: db as never, payload: payload as never },
      USER,
    );
    expect(state.image).toBeNull();
    expect(photos).toEqual([]);
    expect(state.locks).toHaveLength(1);
  });

  it("after an account deletion, deletes the uploads and leaves the row alone", async () => {
    const { db, state } = fakeDb(null);
    state.email = deletedAccountEmail(USER);
    const { payload, photos } = fakePayload([photo(1)]);
    await removeProfilePhoto(
      { db: db as never, payload: payload as never },
      USER,
    );
    expect(photos).toEqual([]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("photoUrl", () => {
  it("prefers the square crop and falls back to the picture", () => {
    expect(photoUrl(photo(1))).toBe("https://s3/t1.jpg");
    expect(photoUrl(photo(1, null))).toBe("https://s3/p1.jpg");
  });

  it("refuses a URL the user row cannot hold", () => {
    expect(() => photoUrl(photo(1, `https://s3/${"x".repeat(250)}`))).toThrow();
  });
});
