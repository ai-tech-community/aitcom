import { describe, expect, it } from "vitest";

import {
  AGENT_MANIFEST_INVARIANTS,
  MANIFEST_VERSION,
  filterScopesByManifest,
  renderManifestText,
} from "./manifest";

describe("filterScopesByManifest (security gate)", () => {
  const scopes = [
    "read",
    "self-profile",
    "contribute",
    "contribute:forum",
    "contribute:feed",
    "commission",
    "commission:accept",
    "commission:polish-text",
  ];

  it("strips every contribute* and commission* scope when manifest not accepted, keeping read and self-profile", () => {
    const result = filterScopesByManifest(scopes, false);

    expect(result).toEqual(["read", "self-profile"]);
    expect(result.some((s) => s.startsWith("contribute"))).toBe(false);
    expect(result.some((s) => s.startsWith("commission"))).toBe(false);
    expect(result).toContain("read");
    expect(result).toContain("self-profile");
  });

  it("returns all scopes unchanged when manifest accepted", () => {
    const result = filterScopesByManifest(scopes, true);

    expect(result).toEqual(scopes);
  });

  it("keeps read/self-profile even when they are the only scopes and not accepted", () => {
    expect(filterScopesByManifest(["read", "self-profile"], false)).toEqual([
      "read",
      "self-profile",
    ]);
  });

  it("returns an empty array when only gated scopes are present and not accepted", () => {
    expect(
      filterScopesByManifest(["contribute", "commission:accept"], false),
    ).toEqual([]);
  });
});

describe("manifest constants and invariants", () => {
  it("pins MANIFEST_VERSION to 2", () => {
    expect(MANIFEST_VERSION).toBe(2);
  });

  it("includes the commissioned-execution invariant", () => {
    const inv = AGENT_MANIFEST_INVARIANTS.find(
      (i) => i.id === "commissioned-execution",
    );

    expect(inv).toBeDefined();
    expect(inv?.title).toBeTruthy();
    expect(inv?.rule).toBeTruthy();
  });
});

describe("renderManifestText", () => {
  it("renders the commissioned-execution rule text and version header", () => {
    const text = renderManifestText();
    const inv = AGENT_MANIFEST_INVARIANTS.find(
      (i) => i.id === "commissioned-execution",
    );

    expect(text).toContain(`# Agent Manifest (v${MANIFEST_VERSION})`);
    expect(inv).toBeDefined();
    expect(text).toContain(inv!.title);
    expect(text).toContain(inv!.rule);
  });
});
