import { describe, it, expect } from "vitest";

import { deriveAgentReadiness } from "./agent-readiness";

const REQUIRED = ["solve-code-cell", "polish-text"];

describe("deriveAgentReadiness", () => {
  it("no agent: nothing ready, all required types missing", () => {
    const r = deriveAgentReadiness({
      agent: null,
      commissions: [],
      requiredTaskTypes: REQUIRED,
    });
    expect(r).toEqual({
      hasActiveAgent: false,
      hasActiveCommission: false,
      missingTaskTypes: REQUIRED,
      ready: false,
    });
  });

  it("inactive agent does not count", () => {
    const r = deriveAgentReadiness({
      agent: { status: "inactive" },
      commissions: [],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.hasActiveAgent).toBe(false);
    expect(r.ready).toBe(false);
  });

  it("revoked commission does not count", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [
        { revokedAt: new Date(), taskTypeAllowlist: REQUIRED },
      ],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.hasActiveCommission).toBe(false);
    expect(r.missingTaskTypes).toEqual(REQUIRED);
    expect(r.ready).toBe(false);
  });

  it("partial allowlist: names exactly the missing types", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [
        { revokedAt: null, taskTypeAllowlist: ["solve-code-cell"] },
      ],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.hasActiveCommission).toBe(true);
    expect(r.missingTaskTypes).toEqual(["polish-text"]);
    expect(r.ready).toBe(false);
  });

  it("coverage may span multiple active commissions", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [
        { revokedAt: null, taskTypeAllowlist: ["solve-code-cell"] },
        { revokedAt: null, taskTypeAllowlist: ["polish-text"] },
      ],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.missingTaskTypes).toEqual([]);
    expect(r.ready).toBe(true);
  });

  it("duplicate required types are deduped", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [{ revokedAt: null, taskTypeAllowlist: [] }],
      requiredTaskTypes: ["polish-text", "polish-text"],
    });
    expect(r.missingTaskTypes).toEqual(["polish-text"]);
  });

  it("no required types (empty template): allowlist check passes", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [{ revokedAt: null, taskTypeAllowlist: [] }],
      requiredTaskTypes: [],
    });
    expect(r).toEqual({
      hasActiveAgent: true,
      hasActiveCommission: true,
      missingTaskTypes: [],
      ready: true,
    });
  });
});
