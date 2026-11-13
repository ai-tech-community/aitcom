import { describe, expect, it, vi } from "vitest";

import { removeItemFiles } from "./item-files";

const FILE = "private/gallery/c1/1b4e28ba-2fa1-41d2-883f-0016d3cca427.jpg";
const THUMB =
  "private/gallery/c1/1b4e28ba-2fa1-41d2-883f-0016d3cca427-thumb.jpg";

function item(over: { fileKey?: string; thumbnailKey?: string } = {}) {
  return {
    id: 7,
    storage: "private" as const,
    fileKey: FILE,
    thumbnailKey: THUMB,
    ...over,
  };
}

function fakes(remove = vi.fn(async (_keys: string[]) => undefined)) {
  const storage = { remove };
  const getStorage = vi.fn(() => storage);
  const log = vi.fn();
  return {
    remove,
    getStorage,
    log,
    deps: { storage: getStorage as never, log },
  };
}

describe("removeItemFiles", () => {
  it("removes the item's file and thumbnail", async () => {
    const { deps, remove, log } = fakes();
    await removeItemFiles(deps, item(), "deleteItem");
    expect(remove).toHaveBeenCalledWith([FILE, THUMB]);
    expect(log).not.toHaveBeenCalled();
  });

  it("never removes a key outside the gallery folders, and says so", async () => {
    const { deps, remove, log } = fakes();
    await removeItemFiles(
      deps,
      item({ fileKey: "private/videos/c1/x.mp4" }),
      "cleanup",
    );
    expect(remove).toHaveBeenCalledWith([THUMB]);
    expect(log).toHaveBeenCalledWith(
      "[gallery.cleanup] left a key outside the gallery folders",
      { itemId: 7, keys: ["private/videos/c1/x.mp4"] },
    );
  });

  it("reaches storage only when a gallery key is left to remove", async () => {
    const { deps, getStorage } = fakes();
    await removeItemFiles(
      deps,
      item({ fileKey: "media/x.jpg", thumbnailKey: "media/x-thumb.jpg" }),
      "discardItem",
    );
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("logs a failed removal by default: the sweep is the net", async () => {
    const error = new Error("s3 down");
    const { deps, log } = fakes(vi.fn().mockRejectedValue(error));
    await expect(
      removeItemFiles(deps, item(), "finishItem"),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "[gallery.finishItem] removing an item's objects failed",
      { itemId: 7, keys: [FILE, THUMB], error },
    );
  });

  it("passes a failed removal on when asked, so the caller can keep the row", async () => {
    const error = new Error("s3 down");
    const { deps, log } = fakes(vi.fn().mockRejectedValue(error));
    await expect(
      removeItemFiles(deps, item(), "cleanup", { onFailure: "throw" }),
    ).rejects.toBe(error);
    expect(log).not.toHaveBeenCalled();
  });
});
