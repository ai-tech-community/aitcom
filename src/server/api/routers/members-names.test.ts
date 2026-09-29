// Router-level test: the profile form saves first/last name to the account
// (ADR-0038). Omitted names stay as they are; empty ones are cleared, so the
// next registration asks again.
import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: { table: unknown; values: unknown }[] = [];
const dbResults: unknown[][] = [];

function chain(table?: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "returning", "values"]) {
    c[m] = () => c;
  }
  c.set = (values: unknown) => {
    updates.push({ table, values });
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    resolve(dbResults.shift() ?? []);
  return c;
}
const fakeDb = {
  select: () => chain(),
  insert: (table: unknown) => chain(table),
  update: (table: unknown) => chain(table),
};

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/lib/gamification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gamification")>()),
  awardBadge: vi.fn(async () => false),
  awardXp: vi.fn(),
}));

const { createCaller } = await import("@/server/api/root");
const { user, memberProfiles } = await import("@/server/db/schema");

const caller = createCaller({
  db: fakeDb as never,
  session: {
    user: { id: "u1", name: "Ada", email: "ada@example.test" },
    session: { id: "s1" },
  } as never,
  headers: new Headers(),
});

const PROFILE = {
  displayName: "Ada",
  bio: null,
  skills: [],
  company: null,
  linkedinUrl: null,
  githubUrl: null,
  websiteUrl: null,
  isPublic: true,
};

beforeEach(() => {
  updates.length = 0;
  dbResults.length = 0;
  dbResults.push([{ userId: "u1" }]); // an existing profile
});

function accountUpdates() {
  return updates.filter((u) => u.table === user).map((u) => u.values);
}

describe("members.upsertProfile — account names", () => {
  it("saves cleaned names to the account", async () => {
    await caller.members.upsertProfile({
      ...PROFILE,
      firstName: " Jan ",
      lastName: "van  der Berg",
    });
    expect(accountUpdates()).toEqual([
      { firstName: "Jan", lastName: "van der Berg" },
    ]);
    expect(updates.some((u) => u.table === memberProfiles)).toBe(true);
  });

  it("clears names sent empty", async () => {
    await caller.members.upsertProfile({
      ...PROFILE,
      firstName: "",
      lastName: "",
    });
    expect(accountUpdates()).toEqual([{ firstName: null, lastName: null }]);
  });

  it("leaves names alone when the form does not send them", async () => {
    await caller.members.upsertProfile(PROFILE);
    expect(accountUpdates()).toEqual([]);
  });
});
