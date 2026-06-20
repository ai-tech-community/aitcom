import { describe, expect, it } from "vitest";

import { resolveProducerTrust, cspForResource } from "@/lib/chat/trust";

describe("resolveProducerTrust", () => {
  it("maps platform-authored UI to platform trust", () => {
    expect(resolveProducerTrust({ kind: "platform" })).toBe("platform");
  });
  it("maps a verified agent to verified_agent", () => {
    expect(resolveProducerTrust({ kind: "agent", verified: true })).toBe("verified_agent");
  });
  it("maps an unverified agent to agent", () => {
    expect(resolveProducerTrust({ kind: "agent", verified: false })).toBe("agent");
  });
  it("maps a human member to member", () => {
    expect(resolveProducerTrust({ kind: "member" })).toBe("member");
  });
});

describe("cspForResource", () => {
  it("locks member-trust UI down: no connect, declared domains ignored", () => {
    const csp = cspForResource("member", { connectDomains: ["evil.example"] });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("evil.example");
  });
  it("honors declared connect domains for verified_agent", () => {
    const csp = cspForResource("verified_agent", { connectDomains: ["api.example.com"] });
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });
});
