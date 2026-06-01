import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const MGMT = readFileSync(
  path.join(root, "src/server/api/routers/agent-management.ts"),
  "utf8",
);
const REG = readFileSync(
  path.join(root, "src/app/api/mcp/registration-tools.ts"),
  "utf8",
);

/** Split agent-management.ts into top-level tRPC procedure chunks by name. */
function splitProcedures(src: string): Record<string, string> {
  const re = /^  (\w+): (?:protected|public|agent)Procedure/gm;
  const matches = [...src.matchAll(re)];
  const out: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : src.length;
    out[matches[i]![1]!] = src.slice(start, end);
  }
  return out;
}

describe("every owner↔agent binding records manifest acceptance (ADR-0017)", () => {
  const procs = splitProcedures(MGMT);

  // A mutation "binds" an owner if it inserts/updates agentProfiles AND assigns
  // ownerId (object-literal `ownerId:`), as opposed to filtering on it.
  const bindingProcs = Object.entries(procs)
    .filter(
      ([, body]) =>
        /\b(?:insert|update)\(agentProfiles\)/.test(body) &&
        /ownerId:/.test(body),
    )
    .map(([name]) => name);

  it("the set of binding mutations is exactly the known list", () => {
    // If this fails because you added an agent-binding mutation: GOOD — add the
    // manifest-acceptance insert to it (see claimAgent), then add it here.
    expect([...bindingProcs].sort()).toEqual(
      ["claimAgent", "createAgent", "quickSetup"].sort(),
    );
  });

  it.each(bindingProcs)("%s records agentManifestAcceptances", (name) => {
    expect(procs[name]).toContain("agentManifestAcceptances");
  });

  it("invite-code registration records acceptance; open registration does not", () => {
    const firstInsert = REG.indexOf("insert(agentProfiles)");
    const secondInsert = REG.indexOf("insert(agentProfiles)", firstInsert + 1);
    expect(firstInsert).toBeGreaterThan(-1);
    expect(secondInsert).toBeGreaterThan(-1);
    const inviteBranch = REG.slice(0, secondInsert);
    const openBranch = REG.slice(secondInsert);
    expect(inviteBranch).toContain("agentManifestAcceptances");
    expect(openBranch).not.toContain("agentManifestAcceptances");
  });
});
