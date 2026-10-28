import { expect, it } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import {
  assertMagazineImage,
  decodeImageBase64,
  magazineImageStorageKey,
} from "./agent-image";

it("stores each upload under the magazine with a unique name", () => {
  const first = magazineImageStorageKey({
    magazineId: 12,
    contentType: "image/jpeg",
    originalName: "Cover Photo!.jpg",
    id: "11111111-1111-1111-1111-111111111111",
  });
  const second = magazineImageStorageKey({
    magazineId: 12,
    contentType: "image/jpeg",
    originalName: "Cover Photo!.jpg",
    id: "22222222-2222-2222-2222-222222222222",
  });
  expect(first).toEqual({
    prefix: "magazines/12",
    name: "11111111-1111-1111-1111-111111111111-cover-photo.jpg",
    mimetype: "image/jpeg",
  });
  expect(second.name).not.toBe(first.name);
  expect(`${first.prefix}/${first.name}`).not.toBe(
    `${second.prefix}/${second.name}`,
  );
});

it("accepts an image within the magazine upload limit", () => {
  const file = assertMagazineImage({
    data: Buffer.from("png"),
    contentType: "image/png",
    magazineId: 4,
    id: "abc",
  });
  expect(file).toMatchObject({
    mimetype: "image/png",
    prefix: "magazines/4",
    name: "abc-image.png",
  });
});

it("rejects a file that is not an image", () => {
  expect(() =>
    assertMagazineImage({
      data: Buffer.from("hi"),
      contentType: "text/plain",
      magazineId: 4,
      id: "abc",
    }),
  ).toThrowError(/Only images are allowed/);
});

it("rejects an image over 2MB", () => {
  expect(() =>
    assertMagazineImage({
      data: Buffer.alloc(MAX_IMAGE_BYTES + 1),
      contentType: "image/jpeg",
      magazineId: 4,
      id: "abc",
    }),
  ).toThrowError(/max 2MB/);
});

it("decodes a data-url prefix without changing the bytes", () => {
  const raw = Buffer.from("hello").toString("base64");
  expect(decodeImageBase64(`data:image/png;base64,${raw}`)).toEqual(
    Buffer.from("hello"),
  );
});
