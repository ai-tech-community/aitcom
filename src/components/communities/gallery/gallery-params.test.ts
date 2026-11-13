import { describe, expect, it } from "vitest";

import {
  galleryListInput,
  hasGalleryFilters,
  parseGalleryParams,
  readUploadLink,
  uploadLinkPath,
  writeGalleryParams,
} from "./gallery-params";

const read = (search: string) =>
  parseGalleryParams(new URLSearchParams(search));

describe("parseGalleryParams", () => {
  it("reads every filter and the open item", () => {
    expect(read("event=12&topic=meetups&type=video&item=7")).toEqual({
      event: 12,
      topic: "meetups",
      type: "video",
      item: 7,
    });
  });

  it("reads the no-event filter", () => {
    expect(read("event=none").event).toBe("none");
  });

  it("drops values the wall cannot ask for", () => {
    expect(read("event=abc&type=audio&item=-3&topic=")).toEqual({
      event: null,
      topic: null,
      type: null,
      item: null,
    });
    expect(read("event=0").event).toBeNull();
    expect(read("event=1.5").event).toBeNull();
    expect(read(`event=${"9".repeat(20)}`).event).toBeNull();
    expect(read(`topic=${"a".repeat(101)}`).topic).toBeNull();
  });
});

describe("writeGalleryParams", () => {
  it("sets what changed and keeps unrelated params", () => {
    const next = writeGalleryParams(new URLSearchParams("ref=feed&topic=a"), {
      event: 4,
      type: "photo",
    });
    expect(next.toString()).toBe("ref=feed&topic=a&event=4&type=photo");
  });

  it("removes filters set back to all", () => {
    const next = writeGalleryParams(
      new URLSearchParams("event=none&topic=a&type=video&item=3"),
      { event: null, topic: null, type: null, item: null },
    );
    expect(next.toString()).toBe("");
  });
});

describe("galleryListInput", () => {
  it("leaves out filters that are not set", () => {
    expect(
      galleryListInput("mlops", {
        event: null,
        topic: null,
        type: null,
        item: null,
      }),
    ).toEqual({ slug: "mlops", limit: 40 });
  });

  it("passes every set filter", () => {
    expect(
      galleryListInput("mlops", {
        event: "none",
        topic: "meetups",
        type: "photo",
        item: 9,
      }),
    ).toEqual({
      slug: "mlops",
      eventId: "none",
      topicSlug: "meetups",
      mediaType: "photo",
      limit: 40,
    });
  });
});

describe("hasGalleryFilters", () => {
  it("ignores the open item", () => {
    expect(
      hasGalleryFilters({ event: null, topic: null, type: null, item: 3 }),
    ).toBe(false);
    expect(
      hasGalleryFilters({ event: null, topic: "a", type: null, item: null }),
    ).toBe(true);
  });
});

describe("the upload link", () => {
  const link = (search: string) => readUploadLink(new URLSearchParams(search));

  it("opens the upload with the linked event", () => {
    expect(link("upload=1&event=4")).toEqual({ eventId: 4 });
  });

  it("opens the upload with no event when none or a bad one is linked", () => {
    expect(link("upload=1")).toEqual({ eventId: null });
    expect(link("upload=1&event=none")).toEqual({ eventId: null });
    expect(link("upload=1&event=abc")).toEqual({ eventId: null });
  });

  it("is absent without upload=1", () => {
    expect(link("event=4")).toBeNull();
    expect(link("upload=yes")).toBeNull();
  });

  it("adds upload=1 to the page's own URL, keeping its filters", () => {
    expect(
      uploadLinkPath({
        pathname: "/en/communities/mlops/gallery",
        search: "?event=4",
      }),
    ).toBe("/en/communities/mlops/gallery?event=4&upload=1");
    expect(
      uploadLinkPath({ pathname: "/en/communities/mlops/gallery", search: "" }),
    ).toBe("/en/communities/mlops/gallery?upload=1");
  });

  it("is removed like any other param", () => {
    expect(
      writeGalleryParams(new URLSearchParams("upload=1&event=4"), {
        upload: null,
      }).toString(),
    ).toBe("event=4");
  });
});
