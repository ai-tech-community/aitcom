import type { PayloadRequest, RequestContext } from "payload";
import { describe, expect, it } from "vitest";

import {
  LEGACY_ROOT_EDIT_MESSAGE,
  MEDIA_DEFAULT_PREFIX,
  holdBackCallerPrefix,
  isWritingAFile,
  noPrefixWrites,
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

type Req = { file?: typeof upload; context: RequestContext };

function request(file?: typeof upload, context: RequestContext = {}): Req {
  return { file, context };
}

function runHook(
  data: Record<string, unknown>,
  req: Req,
  original?: { prefix?: string | null; filename?: string },
): unknown {
  return storeNewFilesUnderAFolder({
    collection: {} as never,
    context: req.context,
    data,
    operation: original ? "update" : "create",
    originalDoc: original,
    req: req as unknown as PayloadRequest,
  });
}

function runBeforeOperation(
  operation: "create" | "update" | "read",
  args: { data?: Record<string, unknown>; overrideAccess?: boolean },
  req: Req,
): unknown {
  return holdBackCallerPrefix({
    args: args as never,
    collection: {} as never,
    context: req.context,
    operation,
    req: req as unknown as PayloadRequest,
  });
}

describe("prefixForNewFile", () => {
  it.each([undefined, null, ""])("uses media for %j", (prefix) => {
    expect(prefixForNewFile(prefix)).toBe(MEDIA_DEFAULT_PREFIX);
  });

  it.each(["media", "magazines/7", "magazines/123"])("accepts %j", (prefix) => {
    expect(prefixForNewFile(prefix)).toBe(prefix);
  });

  it.each([
    ".",
    "./",
    "/",
    "private/classroom/1",
    "media/gallery/public/1",
    "magazines/",
    "magazines/x",
    "magazines/7/",
    "magazines/7/../..",
    "media/",
  ])("refuses %j", (prefix) => {
    expect(() => prefixForNewFile(prefix)).toThrow(/can only be stored under/);
  });
});

describe("isWritingAFile", () => {
  it("sees req.file", () => {
    expect(isWritingAFile(request(upload) as never)).toBe(true);
  });

  it("sees the copy the storage plugin keeps after clearing req.file", () => {
    const req = request(undefined, { _payloadCloudStorage: { file: upload } });
    expect(isWritingAFile(req as never)).toBe(true);
  });

  it("is false with neither", () => {
    expect(isWritingAFile(request() as never)).toBe(false);
    expect(
      isWritingAFile(request(undefined, { _payloadCloudStorage: {} }) as never),
    ).toBe(false);
  });
});

describe("storeNewFilesUnderAFolder", () => {
  it("puts a new file with no prefix under media", () => {
    expect(runHook({ alt: "x" }, request(upload))).toEqual({
      alt: "x",
      prefix: "media",
    });
  });

  it.each(["", null])(
    "puts a new file with prefix %j under media",
    (prefix) => {
      expect(runHook({ prefix }, request(upload))).toEqual({ prefix: "media" });
    },
  );

  it("applies the rule when only the plugin's kept copy of the file is set", () => {
    const req = request(undefined, { _payloadCloudStorage: { file: upload } });
    expect(runHook({ prefix: "" }, req)).toEqual({ prefix: "media" });
  });

  it("uses the prefix a local caller asked for", () => {
    const req = request(upload, { mediaCallerPrefix: "magazines/7" });
    expect(runHook({ prefix: "" }, req)).toEqual({ prefix: "magazines/7" });
  });

  it("refuses a caller prefix outside the allowed folders", () => {
    const req = request(upload, { mediaCallerPrefix: "private/classroom/1" });
    expect(() => runHook({ prefix: "" }, req)).toThrow(
      /can only be stored under/,
    );
  });

  it("keeps a stored magazine folder when the file is replaced", () => {
    expect(
      runHook({ prefix: "magazines/7", filename: "new.png" }, request(upload), {
        prefix: "magazines/7",
        filename: "old.png",
      }),
    ).toEqual({ prefix: "magazines/7", filename: "new.png" });
  });

  it("moves a replaced file of an old root doc under media", () => {
    expect(
      runHook({ prefix: "", filename: "new.png" }, request(upload), {
        prefix: "",
        filename: "old.png",
      }),
    ).toEqual({ prefix: "media", filename: "new.png" });
  });

  it.each(["", null])(
    "refuses re-writing the same file of an old root doc (prefix %j)",
    (prefix) => {
      expect(() =>
        runHook({ prefix, filename: "old.png" }, request(upload), {
          prefix,
          filename: "old.png",
        }),
      ).toThrow(LEGACY_ROOT_EDIT_MESSAGE);
    },
  );

  it("re-writes the same file of a media/ doc in place", () => {
    expect(
      runHook({ prefix: "media", filename: "a.png" }, request(upload), {
        prefix: "media",
        filename: "a.png",
      }),
    ).toEqual({ prefix: "media", filename: "a.png" });
  });

  it.each(["", null, undefined])(
    "leaves the stored prefix %j alone when no file is written",
    (prefix) => {
      const data = { alt: "x", prefix, filename: "old.png" };
      expect(
        runHook(data, request(), {
          prefix: prefix ?? null,
          filename: "old.png",
        }),
      ).toBe(data);
    },
  );
});

describe("holdBackCallerPrefix", () => {
  it("takes a local caller's prefix out of the data and keeps it for beforeChange", () => {
    const req = request(upload);
    const result = runBeforeOperation(
      "create",
      { data: { alt: "x", prefix: "magazines/7" }, overrideAccess: true },
      req,
    );
    expect(result).toEqual({ data: { alt: "x" }, overrideAccess: true });
    expect(req.context.mediaCallerPrefix).toBe("magazines/7");
  });

  it("drops a prefix sent through an access-checked (REST) write", () => {
    const req = request(upload);
    const result = runBeforeOperation(
      "update",
      { data: { prefix: "private/classroom/1" }, overrideAccess: false },
      req,
    );
    expect(result).toEqual({ data: {}, overrideAccess: false });
    expect(req.context.mediaCallerPrefix).toBeUndefined();
  });

  it("clears a value left by an earlier operation on the same request", () => {
    const req = request(upload, { mediaCallerPrefix: "magazines/7" });
    const args = { data: { alt: "x" }, overrideAccess: true };
    expect(runBeforeOperation("create", args, req)).toBe(args);
    expect(req.context.mediaCallerPrefix).toBeUndefined();
  });

  it("ignores operations that write nothing", () => {
    const req = request(undefined, { mediaCallerPrefix: "magazines/7" });
    const args = { data: { prefix: "x" } };
    expect(runBeforeOperation("read", args, req)).toBe(args);
    expect(req.context.mediaCallerPrefix).toBe("magazines/7");
  });
});

describe("noPrefixWrites", () => {
  it("closes the field to access-checked writes", () => {
    expect(noPrefixWrites({} as never)).toBe(false);
  });
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
