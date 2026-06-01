import { describe, expect, it } from "vitest";

import {
  agentApiKeys,
  agentManifestAcceptances,
} from "@/server/db/schema";
import { validateApiKey } from "./api-key";

type KeyRow = {
  id: string;
  agentId: string;
  ownerId: string | null;
  scopes: string[];
  agentStatus: string;
};

/** Minimal fake of the drizzle query builder used by validateApiKey +
 *  hasAcceptedCurrentManifest. Dispatches .limit() results by .from() table. */
function fakeDb(opts: { keyRow: KeyRow | null; accepted: boolean }) {
  const makeSelect = () => {
    let table: unknown;
    const builder: Record<string, unknown> = {
      from(t: unknown) {
        table = t;
        return builder;
      },
      innerJoin() {
        return builder;
      },
      where() {
        return builder;
      },
      async limit() {
        if (table === agentApiKeys) return opts.keyRow ? [opts.keyRow] : [];
        if (table === agentManifestAcceptances)
          return opts.accepted ? [{ id: "acc" }] : [];
        return [];
      },
    };
    return builder;
  };
  return {
    select: () => makeSelect(),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  } as unknown as Parameters<typeof validateApiKey>[0];
}

const RAW = "ait_sk_testkey";

describe("validateApiKey manifest gate", () => {
  const base: KeyRow = {
    id: "k1",
    agentId: "a1",
    ownerId: "owner1",
    scopes: ["read", "contribute", "self-profile"],
    agentStatus: "active",
  };

  it("keeps contribute when the owner has accepted", async () => {
    const res = await validateApiKey(fakeDb({ keyRow: base, accepted: true }), RAW);
    expect(res?.scopes).toEqual(["read", "contribute", "self-profile"]);
  });

  it("strips contribute when the owner has NOT accepted (read-only)", async () => {
    const res = await validateApiKey(fakeDb({ keyRow: base, accepted: false }), RAW);
    expect(res?.scopes).toEqual(["read", "self-profile"]);
  });

  it("unclaimed agent (no owner) is read-only, contribute-limited stripped", async () => {
    const unclaimed: KeyRow = {
      ...base,
      ownerId: null,
      scopes: ["read", "contribute-limited"],
      agentStatus: "unclaimed",
    };
    const res = await validateApiKey(
      fakeDb({ keyRow: unclaimed, accepted: false }),
      RAW,
    );
    expect(res?.scopes).toEqual(["read"]);
  });

  it("returns null for an inactive agent", async () => {
    const res = await validateApiKey(
      fakeDb({ keyRow: { ...base, agentStatus: "inactive" }, accepted: true }),
      RAW,
    );
    expect(res).toBeNull();
  });

  it("returns null when no key matches", async () => {
    const res = await validateApiKey(fakeDb({ keyRow: null, accepted: false }), RAW);
    expect(res).toBeNull();
  });
});
