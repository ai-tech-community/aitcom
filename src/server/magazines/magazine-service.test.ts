import { describe, expect, it, vi } from "vitest";
import type { Deps } from "./deps";
import type { Magazine } from "@/payload-types";
import { magazineErrorCodeOf } from "./errors";
import { ensureMagazineSpace, saveMagazineSettings } from "./magazine-service";

function fixture(existing: Partial<Magazine> | null) {
  const update = vi.fn(async (input: { data: object }) => ({
    id: 1,
    ...input.data,
  }));
  const create = vi.fn(async (input: { data: object }) => ({
    id: 1,
    ...input.data,
  }));
  const deps = {
    payload: {
      find: vi.fn(async () => ({ docs: existing ? [existing] : [] })),
      update,
      create,
    },
    db: {
      // The Magazine tab already owns the slug "magazine".
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { kind: "builtin", builtinSurface: "magazine" },
            ],
          }),
        }),
      }),
      insert: vi.fn(),
    },
  } as unknown as Deps;
  return { deps, update, create };
}

const community = {
  id: "community",
  slug: "builders",
  isListedInDirectory: true,
  joinPolicy: "open" as const,
};
const settings = {
  name: "The Gazette",
  slug: "gazette",
  topics: [],
  defaultVisibility: "members" as const,
};

describe("saved magazine typography", () => {
  it("persists the editor's selected font", async () => {
    const { deps, update } = fixture({ id: 1, font: "italiana" });
    await saveMagazineSettings(
      deps,
      community,
      { ...settings, font: "bodoni" },
      "editor",
      true,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "magazines",
        id: 1,
        data: expect.objectContaining({ font: "bodoni" }),
      }),
    );
  });
  it("preserves the saved font when older API clients omit it", async () => {
    const { deps, update } = fixture({ id: 1, font: "cormorant" });
    await saveMagazineSettings(deps, community, settings, "editor", true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ font: "cormorant" }),
      }),
    );
  });
  it("defaults a newly created magazine to the approved font", async () => {
    const { deps, create } = fixture(null);
    await saveMagazineSettings(deps, community, settings, "editor", true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ font: "italiana" }),
      }),
    );
  });
});

describe("ensureMagazineSpace", () => {
  it("refuses with SPACE_SLUG_TAKEN when a room owns the slug", async () => {
    const insert = vi.fn();
    const database = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ kind: "room", builtinSurface: null }],
          }),
        }),
      }),
      insert,
    } as unknown as Deps["db"];

    const refusal = await ensureMagazineSpace(database, "community").catch(
      (error: unknown) => error,
    );

    expect(magazineErrorCodeOf(refusal)).toBe("SPACE_SLUG_TAKEN");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rethrows any other failure unchanged", async () => {
    const failure = new Error("connection lost");
    const database = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              throw failure;
            },
          }),
        }),
      }),
      insert: vi.fn(),
    } as unknown as Deps["db"];

    await expect(ensureMagazineSpace(database, "community")).rejects.toBe(
      failure,
    );
  });
});
