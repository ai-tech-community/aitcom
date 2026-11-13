// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  hiddenBuiltinSurfaces,
  visibleSpaceCondition,
} from "./space-visibility";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hiddenBuiltinSurfaces", () => {
  it("hides the gallery while its flag is off or unset", () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "false");
    expect(hiddenBuiltinSurfaces()).toEqual(["gallery"]);
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "");
    expect(hiddenBuiltinSurfaces()).toEqual(["gallery"]);
  });

  it("hides nothing once the gallery flag is on", () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "true");
    expect(hiddenBuiltinSurfaces()).toEqual([]);
  });
});

describe("visibleSpaceCondition", () => {
  it("keeps rooms (no surface) and drops hidden surfaces while the flag is off", () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "false");
    const condition = visibleSpaceCondition();
    expect(condition).toBeDefined();
    // The hidden surfaces are the only bound values; the SQL shape itself
    // (rooms kept via IS NULL) is proven against Postgres in
    // spaces.integration.test.ts.
    expect(new PgDialect().sqlToQuery(condition!).params).toEqual(["gallery"]);
  });

  it("adds no condition once the flag is on", () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "true");
    expect(visibleSpaceCondition()).toBeUndefined();
  });
});
