import { describe, expect, it } from "vitest";

import { acceptPickedFiles } from "./gallery-selection";

const photo = (n: number) =>
  new File(["x"], `p${n}.jpg`, { type: "image/jpeg" });
const video = (n: number) =>
  new File(["x"], `v${n}.mp4`, { type: "video/mp4" });
const names = (files: File[]) => files.map((file) => file.name);
const NONE = { files: 0, videos: 0 };

describe("acceptPickedFiles", () => {
  it("takes photos and videos in the order they were picked", () => {
    const result = acceptPickedFiles(NONE, [photo(1), video(1), photo(2)], {
      canConvertVideo: true,
    });
    expect(names(result.accepted)).toEqual(["p1.jpg", "v1.mp4", "p2.jpg"]);
    expect(result.notices).toEqual([]);
  });

  it("keeps the first 30 files of a batch and says so", () => {
    const picked = Array.from({ length: 31 }, (_, i) => photo(i));
    const result = acceptPickedFiles(NONE, picked, { canConvertVideo: true });
    expect(result.accepted).toHaveLength(30);
    expect(result.accepted.at(-1)?.name).toBe("p29.jpg");
    expect(result.notices).toEqual(["tooManyFiles"]);
  });

  it("counts the files already chosen", () => {
    const result = acceptPickedFiles(
      { files: 29, videos: 0 },
      [photo(1), photo(2)],
      { canConvertVideo: true },
    );
    expect(names(result.accepted)).toEqual(["p1.jpg"]);
    expect(result.notices).toEqual(["tooManyFiles"]);
  });

  it("keeps 10 videos at most, and still takes the photos after them", () => {
    const picked = [
      ...Array.from({ length: 11 }, (_, i) => video(i)),
      photo(1),
    ];
    const result = acceptPickedFiles({ files: 0, videos: 0 }, picked, {
      canConvertVideo: true,
    });
    expect(result.accepted.filter((f) => f.type === "video/mp4")).toHaveLength(
      10,
    );
    expect(result.accepted.at(-1)?.name).toBe("p1.jpg");
    expect(result.notices).toEqual(["tooManyVideos"]);
  });

  it("leaves out videos in a browser that cannot convert them, keeping the photos", () => {
    const result = acceptPickedFiles(NONE, [video(1), photo(1)], {
      canConvertVideo: false,
    });
    expect(names(result.accepted)).toEqual(["p1.jpg"]);
    expect(result.notices).toEqual(["videosUnsupported"]);
  });

  it("leaves out files that are neither photos nor videos", () => {
    const pdf = new File(["x"], "agenda.pdf", { type: "application/pdf" });
    const result = acceptPickedFiles(NONE, [pdf, photo(1)], {
      canConvertVideo: true,
    });
    expect(names(result.accepted)).toEqual(["p1.jpg"]);
    expect(result.notices).toEqual(["notMedia"]);
  });
});
