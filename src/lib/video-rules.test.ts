import { describe, expect, it } from "vitest";

import {
  MAX_VIDEO_SECONDS,
  fitWithin,
  isUploadId,
  storageClassFor,
  videoObjectKeys,
} from "./video-rules";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

describe("video rules", () => {
  it("caps length at 90 seconds", () => {
    expect(MAX_VIDEO_SECONDS).toBe(90);
  });

  it("stores public videos under media/ and community-only under private/", () => {
    expect(
      videoObjectKeys({
        visibility: "public",
        communityId: "c-1",
        uploadId: UPLOAD,
      }),
    ).toEqual({
      video: `media/videos/public/c-1/${UPLOAD}.mp4`,
      thumbnail: `media/videos/public/c-1/${UPLOAD}.jpg`,
    });
    expect(
      videoObjectKeys({
        visibility: "community",
        communityId: "c-1",
        uploadId: UPLOAD,
      }),
    ).toEqual({
      video: `private/videos/c-1/${UPLOAD}.mp4`,
      thumbnail: `private/videos/c-1/${UPLOAD}.jpg`,
    });
    expect(storageClassFor("community")).toBe("private");
  });

  it("refuses ids that could escape their folder", () => {
    expect(isUploadId(UPLOAD)).toBe(true);
    expect(isUploadId("../x")).toBe(false);
    expect(() =>
      videoObjectKeys({
        visibility: "public",
        communityId: "../c",
        uploadId: UPLOAD,
      }),
    ).toThrow();
    expect(() =>
      videoObjectKeys({
        visibility: "public",
        communityId: "c",
        uploadId: "x/y",
      }),
    ).toThrow();
  });

  it("fits the long side to 1280 with even sides and never upscales", () => {
    expect(fitWithin(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(fitWithin(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(fitWithin(640, 360)).toEqual({ width: 640, height: 360 });
    expect(fitWithin(1081, 1921)).toEqual({ width: 720, height: 1280 });
    expect(() => fitWithin(0, 100)).toThrow();
    expect(() => fitWithin(Infinity, 100)).toThrow("invalid video size");
    expect(() => fitWithin(100, Number.POSITIVE_INFINITY)).toThrow(
      "invalid video size",
    );
    expect(() => fitWithin(Number.NaN, 100)).toThrow("invalid video size");
  });
});
