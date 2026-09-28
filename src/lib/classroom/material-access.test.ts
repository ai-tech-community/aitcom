import { describe, expect, it } from "vitest";

import {
  buildMaterialsManifest,
  materialAccessFor,
  mayDownloadMaterial,
  type ManifestMaterial,
} from "./material-access";

describe("mayDownloadMaterial", () => {
  it.each([
    ["manager", "members", true],
    ["manager", "preview", true],
    ["member", "members", true],
    ["member", "preview", true],
    ["visitor", "members", false],
    ["visitor", "preview", true],
    ["none", "members", false],
    ["none", "preview", false],
  ] as const)("%s + %s file → %s", (viewer, visibility, allowed) => {
    expect(mayDownloadMaterial(viewer, visibility)).toBe(allowed);
  });
});

describe("materialAccessFor", () => {
  it.each([
    ["visitor", "members", "ready", "join"],
    ["visitor", "members", "uploading", "join"],
    ["visitor", "preview", "uploading", "processing"],
    ["visitor", "preview", "ready", "download"],
    ["member", "members", "failed", "failed"],
    ["member", "members", "ready", "download"],
    ["manager", "members", "uploading", "processing"],
  ] as const)("%s, %s file, %s → %s", (viewer, visibility, status, access) => {
    expect(materialAccessFor(viewer, { status, visibility })).toBe(access);
  });
});

describe("buildMaterialsManifest", () => {
  const file = (over: Partial<ManifestMaterial>): ManifestMaterial => ({
    id: 1,
    kind: "file",
    title: "Workbook",
    extension: "pdf",
    contentType: "application/pdf",
    bytes: 4096,
    status: "ready",
    visibility: "members",
    ...over,
  });

  it("describes each referenced file for this viewer, and marks missing ones removed", () => {
    const withSecret = {
      ...file({ id: 2, visibility: "preview", title: "Sample" }),
      storageKey: "private/classroom/c/1/x.pdf",
    };
    const manifest = buildMaterialsManifest(
      [1, 2, 3],
      [file({ id: 1 }), withSecret],
      "visitor",
    );
    expect(manifest).toEqual({
      1: {
        access: "join",
        kind: "file",
        title: "Workbook",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 4096,
        status: "ready",
        visibility: "members",
      },
      2: {
        access: "download",
        kind: "file",
        title: "Sample",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 4096,
        status: "ready",
        visibility: "preview",
      },
      3: { access: "removed" },
    });
  });

  it("is empty when no file is referenced", () => {
    expect(buildMaterialsManifest([], [file({})], "member")).toEqual({});
  });
});
