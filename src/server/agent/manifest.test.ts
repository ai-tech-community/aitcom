import { describe, expect, it } from "vitest";
import {
  AGENT_MANIFEST_INVARIANTS,
  MANIFEST_VERSION,
  filterScopesByManifest,
  renderManifestText,
} from "./manifest";

describe("manifest invariants", () => {
  it("has the six ADR-0017 invariants in order", () => {
    expect(AGENT_MANIFEST_INVARIANTS.map((i) => i.id)).toEqual([
      "owner-only-channel",
      "no-agent-to-agent",
      "no-go-surfaces",
      "draft-dont-publish",
      "read-is-free",
      "one-agent-per-human",
    ]);
  });
});

describe("renderManifestText", () => {
  it("renders the version header and every invariant", () => {
    const text = renderManifestText();
    expect(text).toContain(`Agent Manifest (v${MANIFEST_VERSION})`);
    for (const inv of AGENT_MANIFEST_INVARIANTS) {
      expect(text).toContain(inv.title);
    }
  });
});

describe("filterScopesByManifest", () => {
  it("returns all scopes when accepted", () => {
    expect(
      filterScopesByManifest(["read", "contribute", "self-profile"], true),
    ).toEqual(["read", "contribute", "self-profile"]);
  });
  it("strips contribute and contribute-limited when not accepted", () => {
    expect(
      filterScopesByManifest(["read", "contribute", "self-profile"], false),
    ).toEqual(["read", "self-profile"]);
    expect(
      filterScopesByManifest(["read", "contribute-limited"], false),
    ).toEqual(["read"]);
  });
});
