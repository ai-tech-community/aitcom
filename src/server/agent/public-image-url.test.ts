import { expect, it } from "vitest";

import { isPublicImageUrl, publicImageUrlSchema } from "./public-image-url";

it("accepts an http(s) cover or logo and refuses other schemes", () => {
  expect(isPublicImageUrl("https://cdn.example/cover.png")).toBe(true);
  expect(isPublicImageUrl("http://cdn.example/logo.jpg")).toBe(true);
  expect(
    publicImageUrlSchema.safeParse("https://cdn.example/cover.png").success,
  ).toBe(true);
  expect(isPublicImageUrl("javascript:alert(1)")).toBe(false);
  expect(isPublicImageUrl("ftp://cdn.example/cover.png")).toBe(false);
  expect(isPublicImageUrl(" https://cdn.example/cover.png")).toBe(false);
  expect(publicImageUrlSchema.safeParse("not a url").success).toBe(false);
});
