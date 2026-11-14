import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";

import {
  MEDIA_DEFAULT_PREFIX,
  prefixForNewFile,
  readMissingPrefixAsBucketRoot,
  storeNewFilesUnderAFolder,
} from "./media-prefix";

const upload = {
  data: Buffer.from("png"),
  mimetype: "image/png",
  name: "a.png",
  size: 3,
};

function runHook(data: Record<string, unknown>, file?: typeof upload): unknown {
  return storeNewFilesUnderAFolder({
    collection: {} as never,
    context: {},
    data,
    operation: "create",
    originalDoc: undefined,
    req: { file } as unknown as PayloadRequest,
  });
}

describe("prefixForNewFile", () => {
  it.each([undefined, null, ""])("uses media for %j", (prefix) => {
    expect(prefixForNewFile(prefix)).toBe(MEDIA_DEFAULT_PREFIX);
  });

  it("keeps a folder the caller chose", () => {
    expect(prefixForNewFile("magazines/7")).toBe("magazines/7");
  });
});

describe("storeNewFilesUnderAFolder", () => {
  it("puts a new file with no prefix under media", () => {
    expect(runHook({ alt: "x" }, upload)).toEqual({
      alt: "x",
      prefix: "media",
    });
  });

  it.each(["", null])(
    "puts a new file with prefix %j under media",
    (prefix) => {
      expect(runHook({ prefix }, upload)).toEqual({ prefix: "media" });
    },
  );

  it("keeps the caller's folder for a new file", () => {
    expect(runHook({ prefix: "magazines/7" }, upload)).toEqual({
      prefix: "magazines/7",
    });
  });

  it.each(["", null, undefined])(
    "leaves the stored prefix %j alone when no file is written",
    (prefix) => {
      const data = { alt: "x", prefix };
      expect(runHook(data)).toBe(data);
    },
  );
});

describe("readMissingPrefixAsBucketRoot", () => {
  const read = (value: unknown) =>
    readMissingPrefixAsBucketRoot({ value } as never);

  it.each([null, undefined])("reads %j as the bucket root", (value) => {
    expect(read(value)).toBe("");
  });

  it.each(["", "media", "magazines/7"])("keeps %j", (value) => {
    expect(read(value)).toBe(value);
  });
});
