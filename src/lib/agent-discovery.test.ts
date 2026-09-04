import { describe, expect, it } from "vitest";

import { MCP_ENDPOINT } from "@/lib/setup-guide";

import {
  AI_CATALOG,
  AUTH_MD,
  CONTENT_SIGNAL,
  MCP_SERVER_CARD,
  ROBOTS_TXT,
} from "./agent-discovery";
import { GET as getAiCatalog } from "@/app/.well-known/ai-catalog.json/route";
import { GET as getServerCard } from "@/app/.well-known/mcp/server-card.json/route";
import { GET as getAuthMd } from "@/app/auth.md/route";
import { GET as getRobotsTxt } from "@/app/robots.txt/route";

const BANNED_OAUTH = [
  /oauth-authorization-server/i,
  /oauth-protected-resource/i,
  /openid-configuration/i,
  /token_endpoint/i,
  /authorization_endpoint/i,
  /jwks_uri/i,
];

describe("robots.txt Content-Signal", () => {
  it("includes the locked Content-Signal line", () => {
    expect(CONTENT_SIGNAL).toBe("ai-train=no, search=yes, ai-input=yes");
    expect(ROBOTS_TXT).toContain(
      "Content-Signal: ai-train=no, search=yes, ai-input=yes",
    );
  });

  it("preserves the existing allow and disallow rules", () => {
    expect(ROBOTS_TXT).toContain("User-Agent: *");
    expect(ROBOTS_TXT).toContain("Allow: /");
    expect(ROBOTS_TXT).toContain("Disallow: /dashboard");
    expect(ROBOTS_TXT).toContain("Disallow: /auth/");
    expect(ROBOTS_TXT).toContain("Disallow: /admin");
    expect(ROBOTS_TXT).toContain(
      "Sitemap: https://aitcommunity.org/sitemap.xml",
    );
  });

  it("serves the same body at /robots.txt", () => {
    const response = getRobotsTxt();
    expect(response.headers.get("Content-Type")).toMatch(/text\/plain/);
    return expect(response.text()).resolves.toBe(ROBOTS_TXT);
  });
});

describe("MCP server card", () => {
  it("points at the live Streamable HTTP MCP endpoint", () => {
    expect(MCP_ENDPOINT).toBe("https://www.aitcommunity.org/api/mcp");
    expect(MCP_SERVER_CARD.name).toBe("aitcommunity");
    expect(MCP_SERVER_CARD.version).toBe("0.4.0");
    expect(MCP_SERVER_CARD.remotes).toEqual([
      {
        type: "streamable-http",
        url: MCP_ENDPOINT,
      },
    ]);
  });

  it("does not invent a tools list", () => {
    expect(MCP_SERVER_CARD).not.toHaveProperty("tools");
    expect(JSON.stringify(MCP_SERVER_CARD)).not.toContain('"tools"');
  });

  it("serves the card JSON at /.well-known/mcp/server-card.json", async () => {
    const response = getServerCard();
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = (await response.json()) as typeof MCP_SERVER_CARD;
    expect(body.remotes[0]?.url).toBe("https://www.aitcommunity.org/api/mcp");
    expect(body).toEqual(MCP_SERVER_CARD);
  });
});

describe("ARD ai-catalog", () => {
  it("has exactly three entries — Hub, MCP, Setup", () => {
    expect(AI_CATALOG.specVersion).toBe("1.0");
    expect(AI_CATALOG.host).toEqual({ displayName: "AIT Community" });
    expect(AI_CATALOG.entries).toHaveLength(3);

    const [hub, mcp, setup] = AI_CATALOG.entries;
    expect(hub?.displayName).toBe("Hub");
    expect(hub?.url).toBe("https://www.aitcommunity.org/en");
    expect(hub?.identifier).toMatch(/^urn:air:aitcommunity\.org:/);
    expect(hub?.type).toBe("text/html");
    expect(hub).not.toHaveProperty("data");

    expect(mcp?.displayName).toBe("MCP");
    expect(mcp?.url).toBe("https://www.aitcommunity.org/api/mcp");
    expect(mcp?.identifier).toMatch(/^urn:air:aitcommunity\.org:/);
    expect(mcp?.type).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
    expect(mcp).not.toHaveProperty("data");

    expect(setup?.displayName).toBe("Setup");
    expect(setup?.url).toBe("https://www.aitcommunity.org/en/setup");
    expect(setup?.identifier).toMatch(/^urn:air:aitcommunity\.org:/);
    expect(setup?.type).toBe("text/html");
    expect(setup).not.toHaveProperty("data");
  });

  it("grounds representativeQueries (2–5) on what those pages are", () => {
    for (const entry of AI_CATALOG.entries) {
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
    }

    const hubQueries = AI_CATALOG.entries[0]!.representativeQueries.join(" ");
    expect(hubQueries.toLowerCase()).toMatch(/communit/);

    const mcpQueries = AI_CATALOG.entries[1]!.representativeQueries.join(" ");
    expect(mcpQueries).toMatch(/register-agent/);

    const setupQueries = AI_CATALOG.entries[2]!.representativeQueries.join(" ");
    expect(setupQueries.toLowerCase()).toMatch(/clone|hub|agent\.md/);
  });

  it("serves JSON with CORS * at /.well-known/ai-catalog.json", async () => {
    const response = getAiCatalog();
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await response.json()) as typeof AI_CATALOG;
    expect(body.entries).toHaveLength(3);
    expect(body.entries.map((entry) => entry.displayName)).toEqual([
      "Hub",
      "MCP",
      "Setup",
    ]);
  });
});

describe("auth.md", () => {
  it("uses an H1 that contains auth.md", () => {
    const h1 = AUTH_MD.split("\n")[0] ?? "";
    expect(h1).toMatch(/^#\s+/);
    expect(h1.toLowerCase()).toMatch(/auth\.md/);
  });

  it("restates the live register-agent → claim path", () => {
    expect(AUTH_MD).toMatch(/register-agent/);
    expect(AUTH_MD.toLowerCase()).toMatch(/claim/);
    expect(AUTH_MD).toContain("https://www.aitcommunity.org/agent.md");
    expect(AUTH_MD).toContain("https://www.aitcommunity.org/en/setup");
  });

  it("does not invent OAuth discovery endpoints", () => {
    for (const pattern of BANNED_OAUTH) {
      expect(AUTH_MD).not.toMatch(pattern);
    }
  });

  it("serves markdown at /auth.md", async () => {
    const response = getAuthMd();
    expect(response.headers.get("Content-Type")).toMatch(/text\/markdown/);
    await expect(response.text()).resolves.toBe(AUTH_MD);
  });
});
