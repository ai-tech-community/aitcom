import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import type { Media } from "@/payload-types";

import {
  PROFILE_PHOTO_ALT,
  ProfilePhotoRejectedError,
  deleteProfilePhotoFiles,
  photoUrl,
  removeProfilePhoto,
  setProfilePhoto,
} from "./profile-photo";

const USER = "user-a";

function photo(id: number, thumbnail: string | null = `https://s3/t${id}.jpg`) {
  return {
    id,
    url: `https://s3/p${id}.jpg`,
    sizes: { thumbnail: { url: thumbnail } },
  } as unknown as Media;
}

/** A database whose transaction records what it ran, holding `image`. */
function fakeDb(initialImage: string | null = "https://github/ada.png") {
  const state = { image: initialImage, locks: [] as unknown[], inTx: false };
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
        where: () => ({ limit: async () => [{ image: state.image }] }),
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
  return { db, tx, state };
}

/** Payload holding the member's photos; `find` returns them newest first. */
function fakePayload(existing: Media[] = []) {
  const photos = [...existing];
  let nextId = Math.max(0, ...existing.map((p) => p.id)) + 1;
  const payload = {
    create: vi.fn(async () => {
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

const jpeg = (size = 10) => ({
  data: Buffer.alloc(size),
  mimetype: "image/jpeg",
});

beforeEach(() => vi.clearAllMocks());

describe("setProfilePhoto", () => {
  it("refuses a picture type we do not store, uploading nothing", async () => {
    const { db } = fakeDb();
    const { payload } = fakePayload();
    for (const mimetype of ["image/svg+xml", "text/html", ""]) {
      await expect(
        setProfilePhoto(
          { db: db as never, payload: payload as never },
          { userId: USER, file: { data: Buffer.alloc(1), mimetype } },
        ),
      ).rejects.toEqual(new ProfilePhotoRejectedError("type"));
    }
    expect(payload.create).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses a picture over the upload limit", async () => {
    const { db } = fakeDb();
    const { payload } = fakePayload();
    await expect(
      setProfilePhoto(
        { db: db as never, payload: payload as never },
        { userId: USER, file: jpeg(MAX_IMAGE_BYTES + 1) },
      ),
    ).rejects.toMatchObject({ reason: "size" });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("stores the picture as the member's own profile photo under a random name", async () => {
    const { db } = fakeDb();
    const { payload } = fakePayload();
    await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, file: jpeg() },
    );
    expect(payload.create).toHaveBeenCalledWith({
      collection: "media",
      data: { alt: PROFILE_PHOTO_ALT, uploadedBy: USER, purpose: "avatar" },
      file: expect.objectContaining({
        mimetype: "image/jpeg",
        size: 10,
        name: expect.stringMatching(/^avatar-[0-9a-f-]{36}\.jpg$/),
      }),
    });
  });

  it("shows the new photo's square crop and deletes the older photos", async () => {
    const { db, state } = fakeDb();
    const { payload, photos } = fakePayload([photo(3), photo(5)]);
    const result = await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, file: jpeg() },
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
      { userId: USER, file: jpeg() },
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
      { userId: USER, file: jpeg() },
    );
    expect(state.image).toBe("https://s3/t2.jpg");
    expect(photos.map((p) => p.id)).toEqual([2]);
  });

  it("leaves the picture as a remove in another tab set it", async () => {
    const { db, state } = fakeDb(null);
    const { payload, photos } = fakePayload();
    // The remove settled first and deleted this upload.
    payload.create.mockImplementationOnce(async () => photo(1));
    const result = await setProfilePhoto(
      { db: db as never, payload: payload as never },
      { userId: USER, file: jpeg() },
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
      { userId: USER, file: jpeg() },
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
});

describe("deleteProfilePhotoFiles", () => {
  it("deletes every uploaded photo without touching the picture", async () => {
    const { payload, photos } = fakePayload([photo(1), photo(2)]);
    await deleteProfilePhotoFiles({ payload: payload as never }, USER);
    expect(photos).toEqual([]);
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
