import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveHubAuthUser } from "./hub-session";

const SOREN = {
  id: "soren-ravn",
  name: "Soren Ravn",
  email: "soren.prefetch.verify@example.com",
};

describe("resolveHubAuthUser", () => {
  it("keeps the document-request user when useSession is still empty", () => {
    expect(resolveHubAuthUser(SOREN, undefined)).toEqual(SOREN);
    expect(resolveHubAuthUser(SOREN, null)).toEqual(SOREN);
  });

  it("prefers the client user once GET /get-session returns one", () => {
    const client = { ...SOREN, name: "Soren" };
    expect(resolveHubAuthUser(SOREN, client)).toEqual(client);
  });

  it("stays signed-out when neither reader has a user", () => {
    expect(resolveHubAuthUser(null, null)).toBeNull();
    expect(resolveHubAuthUser(undefined, undefined)).toBeNull();
  });
});

describe("Hub actually reads the verify cookie", () => {
  const dir = dirname(fileURLToPath(import.meta.url));

  it("locale layout seeds SessionProvider from server getSession", () => {
    const src = readFileSync(
      join(dir, "../../app/[locale]/layout.tsx"),
      "utf8",
    );
    expect(src).toContain('from "@/server/better-auth/server"');
    expect(src).toContain("getSession()");
    expect(src).toContain("SessionProvider");
    expect(src).toContain("initialUser");
  });

  it("community page passes the document-request user into Hub", () => {
    const src = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/page.tsx"),
      "utf8",
    );
    expect(src).toContain('from "@/server/better-auth/server"');
    expect(src).toContain("getSession()");
    expect(src).toContain("initialUser");
  });

  it("Hub overview and community layout use the document-request user", () => {
    const overview = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/_overview-client.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/layout.tsx"),
      "utf8",
    );
    expect(overview).toContain("resolveHubAuthUser");
    expect(overview).toContain("initialUser");
    expect(layout).toContain("resolveHubAuthUser");
    expect(layout).toContain("initialUser");
  });

  it("navbar JOIN uses the same document-request user as Hub", () => {
    const src = readFileSync(join(dir, "../../components/navbar.tsx"), "utf8");
    expect(src).toContain("resolveHubAuthUser");
    expect(src).toContain("initialUser");
  });
});
