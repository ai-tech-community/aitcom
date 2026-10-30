import { describe, expect, it, vi } from "vitest";
import type { Deps } from "./deps";
import type { Magazine } from "@/payload-types";
import { saveMagazineSettings } from "./magazine-service";

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
      query: {
        spaces: {
          findFirst: vi.fn(async () => ({
            kind: "builtin",
            builtinSurface: "magazine",
          })),
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
        }),
      }),
      insert: () => ({
        values: () => ({ onConflictDoNothing: async () => undefined }),
      }),
    },
  } as unknown as Deps;
  return { deps, update, create };
}

const community = {
  id: "community",
  slug: "builders",
  isListedInDirectory: true,
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
