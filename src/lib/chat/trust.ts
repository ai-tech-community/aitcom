import type { UiProducerTrust, UiResource } from "@/lib/chat/types";

export type ProducerDescriptor =
  | { kind: "platform" }
  | { kind: "agent"; verified: boolean }
  | { kind: "member" };

export function resolveProducerTrust(p: ProducerDescriptor): UiProducerTrust {
  switch (p.kind) {
    case "platform":
      return "platform";
    case "member":
      return "member";
    case "agent":
      return p.verified ? "verified_agent" : "agent";
  }
}

const HONORS_DECLARED_DOMAINS: Record<UiProducerTrust, boolean> = {
  platform: true,
  verified_agent: true,
  agent: false,
  member: false,
};

/**
 * Whether a producer at this trust tier may have its declared CSP domains
 * honored. The host uses this to decide what (if anything) to forward to the
 * sandbox proxy as `?csp=`; untrusted tiers get the restrictive default.
 */
export function honorsDeclaredDomains(trust: UiProducerTrust): boolean {
  return HONORS_DECLARED_DOMAINS[trust];
}

function domainList(domains: string[] | undefined): string {
  if (!domains || domains.length === 0) return "";
  return " " + domains.map((d) => `https://${d}`).join(" ");
}

export function cspForResource(
  trust: UiProducerTrust,
  csp: UiResource["csp"] = {},
): string {
  const honor = HONORS_DECLARED_DOMAINS[trust];
  const resource = honor ? domainList(csp.resourceDomains) : "";
  const frame = honor ? domainList(csp.frameDomains) : "";
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    `style-src 'self' 'unsafe-inline'${resource}`,
    `img-src 'self' data:${resource}`,
    `connect-src ${honor && csp.connectDomains?.length ? `'self'${domainList(csp.connectDomains)}` : "'none'"}`,
    `frame-src ${frame ? `'self'${frame}` : "'none'"}`,
    "base-uri 'none'",
  ].join("; ");
}
