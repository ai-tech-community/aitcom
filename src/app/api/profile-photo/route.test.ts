// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  setProfilePhoto: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: { tag: "db" } }));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({ tag: "payload" }),
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock("@/server/members/profile-photo", async () => {
  class ProfilePhotoRejectedError extends Error {
    constructor(readonly reason: "type" | "size") {
      super(reason === "type" ? "Wrong type" : "Too large");
    }
  }
  return { ProfilePhotoRejectedError, setProfilePhoto: m.setProfilePhoto };
});

const { POST } = await import("./route");
const { ProfilePhotoRejectedError } =
  await import("@/server/members/profile-photo");

function request(file?: File) {
  const body = new FormData();
  if (file) body.append("file", file);
  return new Request("https://app.test/api/profile-photo", {
    method: "POST",
    body,
  }) as never;
}

const picture = () =>
  new File([new Uint8Array([1, 2, 3])], "me at the beach.png", {
    type: "image/png",
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: "user-a" } });
  m.setProfilePhoto.mockResolvedValue({ image: "https://s3/t1.png" });
});

describe("POST /api/profile-photo", () => {
  it("refuses a signed-out caller", async () => {
    m.getSession.mockResolvedValue(null);
    const res = await POST(request(picture()));
    expect(res.status).toBe(401);
    expect(m.setProfilePhoto).not.toHaveBeenCalled();
  });

  it("asks for a file", async () => {
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(m.setProfilePhoto).not.toHaveBeenCalled();
  });

  it("sets the signed-in member's photo from the file's bytes", async () => {
    const res = await POST(request(picture()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: "https://s3/t1.png" });
    expect(m.setProfilePhoto).toHaveBeenCalledWith(
      { db: { tag: "db" }, payload: { tag: "payload" } },
      { userId: "user-a", data: Buffer.from([1, 2, 3]) },
    );
  });

  it("explains a picture it cannot use", async () => {
    m.setProfilePhoto.mockRejectedValue(new ProfilePhotoRejectedError("size"));
    const res = await POST(request(picture()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Too large", reason: "size" });
  });
});
