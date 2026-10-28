import { expect, it } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import { assertMagazineImage, decodeImageBase64 } from "./agent-image";

it("accepts an image within the magazine upload limit", () => {
  const file = assertMagazineImage({
    data: Buffer.from("png"),
    contentType: "image/png",
  });
  expect(file).toMatchObject({
    mimetype: "image/png",
    name: "magazine-image.png",
  });
});

it("rejects a file that is not an image", () => {
  expect(() =>
    assertMagazineImage({ data: Buffer.from("hi"), contentType: "text/plain" }),
  ).toThrowError(/Only images are allowed/);
});

it("rejects an image over 2MB", () => {
  expect(() =>
    assertMagazineImage({
      data: Buffer.alloc(MAX_IMAGE_BYTES + 1),
      contentType: "image/jpeg",
    }),
  ).toThrowError(/max 2MB/);
});

it("decodes a data-url prefix without changing the bytes", () => {
  const raw = Buffer.from("hello").toString("base64");
  expect(decodeImageBase64(`data:image/png;base64,${raw}`)).toEqual(
    Buffer.from("hello"),
  );
});
