import { describe, expect, it } from "vitest";
import { itemImageSchema, newItemImage, readItemImage } from "./item-image";

describe("issue item image", () => {
  it("starts centered in a landscape crop", () => {
    expect(newItemImage("https://example.test/photo.jpg")).toEqual({
      url: "https://example.test/photo.jpg",
      alt: "",
      caption: "",
      credit: "",
      shape: "landscape",
      focalX: 50,
      focalY: 50,
    });
  });
  it("normalizes saved text and keeps the intended crop", () => {
    expect(
      itemImageSchema.parse({
        url: "/api/media/photo.jpg",
        alt: " Builders ",
        caption: " A moment together. ",
        credit: " Photo: Jo ",
        shape: "portrait",
        focalX: 20,
        focalY: 85,
      }),
    ).toMatchObject({
      alt: "Builders",
      caption: "A moment together.",
      credit: "Photo: Jo",
      shape: "portrait",
      focalX: 20,
      focalY: 85,
    });
  });
  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,test",
    "//example.test/photo.jpg",
    "https://user:secret@example.test/photo.jpg",
  ])("rejects unsafe image URL %s", (url) => {
    expect(readItemImage({ url })).toBeNull();
  });
  it.each([
    { focalX: -1 },
    { focalY: 101 },
    { focalX: 0.5 },
    { shape: "panorama" },
    { caption: "x".repeat(301) },
  ])("rejects invalid composition %j", (patch) => {
    expect(
      readItemImage({ url: "https://example.test/photo.jpg", ...patch }),
    ).toBeNull();
  });
  it.each([null, undefined, "old value", {}])(
    "ignores missing or invalid stored metadata %j",
    (value) => {
      expect(readItemImage(value)).toBeNull();
    },
  );
});
