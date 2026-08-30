import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  hubDocumentPaint,
  memberRoleForSlug,
  membershipStatusForSlug,
  resolveHubAuthUser,
  toHubAuthUser,
} from "./hub-session";

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

  it("maps a document-request session user and Hub membership", () => {
    expect(toHubAuthUser({ id: SOREN.id, name: SOREN.name })).toEqual({
      id: SOREN.id,
      name: SOREN.name,
      email: undefined,
      image: undefined,
    });
    expect(toHubAuthUser(null)).toBeNull();
    const rows = [
      { slug: "ait", status: "active" as const, role: "member" as const },
    ];
    expect(memberRoleForSlug(rows, "ait")).toBe("member");
    expect(membershipStatusForSlug(rows, "ait")).toBe("active");
    expect(memberRoleForSlug(rows, "other")).toBeNull();
  });
});

describe("Hub actually reads the verify cookie", () => {
  const dir = dirname(fileURLToPath(import.meta.url));

  it("locale layout seeds SessionProvider from the document-request seed", () => {
    const src = readFileSync(
      join(dir, "../../app/[locale]/layout.tsx"),
      "utf8",
    );
    expect(src).toContain("loadHubAuthSeed");
    expect(src).toContain("SessionProvider");
    expect(src).toContain("initialUser");
  });

  it("community page passes the document-request user and membership into Hub", () => {
    const src = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("loadHubAuthSeed");
    expect(src).toContain("initialUser");
    expect(src).toContain("initialMemberships");
  });

  it("Hub overview and community layout use the document-request user and membership", () => {
    const overview = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/_overview-client.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/layout.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      join(
        dir,
        "../../app/[locale]/communities/[slug]/_community-layout-client.tsx",
      ),
      "utf8",
    );
    expect(overview).toContain("resolveHubAuthUser");
    expect(overview).toContain("memberRoleForSlug");
    expect(overview).toContain("initialMemberships");
    expect(layout).toContain("loadHubAuthSeed");
    expect(layout).toContain("initialMemberships");
    expect(shell).toContain("resolveHubAuthUser");
    expect(shell).toContain("initialMemberships");
  });

  it("navbar JOIN uses the same document-request user as Hub", () => {
    const src = readFileSync(join(dir, "../../components/navbar.tsx"), "utf8");
    expect(src).toContain("resolveHubAuthUser");
    expect(src).toContain("initialUser");
  });

  it("document-request seed reads getSession then Hub membership", () => {
    const src = readFileSync(join(dir, "hub-session-server.ts"), "utf8");
    expect(src).toContain("getSession()");
    expect(src).toContain("listMyCommunities");
  });

  it("pins Hub layout and page so a signed-out RSC cannot be cached", () => {
    const localeLayout = readFileSync(
      join(dir, "../../app/[locale]/layout.tsx"),
      "utf8",
    );
    const hubPage = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/page.tsx"),
      "utf8",
    );
    const hubLayout = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/layout.tsx"),
      "utf8",
    );
    expect(localeLayout).toContain('dynamic = "force-dynamic"');
    expect(hubPage).toContain('dynamic = "force-dynamic"');
    expect(hubLayout).toContain('dynamic = "force-dynamic"');
  });

  it("verify leftover pin: www Location, apex hop, document getSession", () => {
    const replay = readFileSync(
      join(dir, "sign-in-on-replayed-verify.ts"),
      "utf8",
    );
    const middleware = readFileSync(join(dir, "../../middleware.ts"), "utf8");
    const nextConfig = readFileSync(
      join(dir, "../../../next.config.js"),
      "utf8",
    );
    expect(replay).toContain("pinVerifyRedirectLocation");
    expect(middleware).toContain("getApexToWwwRedirectUrl");
    expect(nextConfig).toContain("aitcommunity.org");
    expect(nextConfig).toContain("www.aitcommunity.org");
  });

  it("Hub document getSession merges cookies() onto headers that omitted Cookie", () => {
    const src = readFileSync(join(dir, "server.ts"), "utf8");
    expect(src).toContain("cookies()");
    expect(src).toContain("headersForDocumentAuth");
    const seed = readFileSync(join(dir, "hub-session-server.ts"), "utf8");
    expect(seed).toContain("getSession()");
  });

  it("forum uses the document-request user so Sign in to post is not JOIN leftover", () => {
    const forumPage = readFileSync(
      join(dir, "../../components/forum/forum-page.tsx"),
      "utf8",
    );
    const createThread = readFileSync(
      join(dir, "../../components/forum/create-thread-form.tsx"),
      "utf8",
    );
    const communityForum = readFileSync(
      join(dir, "../../app/[locale]/communities/[slug]/forum/page.tsx"),
      "utf8",
    );
    expect(forumPage).toContain("resolveHubAuthUser");
    expect(forumPage).toContain("useInitialAuthUser");
    expect(createThread).toContain("resolveHubAuthUser");
    expect(createThread).toContain("useInitialAuthUser");
    expect(communityForum).toContain("resolveHubAuthUser");
    expect(communityForum).toContain("useInitialAuthUser");
  });
});

describe("hubDocumentPaint", () => {
  it("hides JOIN and sign-in copy when the document getSession returned a user", () => {
    const memberships = [
      { slug: "ait", status: "active" as const, role: "member" as const },
    ];
    expect(hubDocumentPaint(SOREN, memberships)).toEqual({
      navbarJoin: false,
      feedSignIn: false,
      forumSignInToPost: false,
      communityJoin: false,
    });
  });

  it("keeps JOIN and sign-in copy when the document getSession missed the cookie", () => {
    expect(hubDocumentPaint(null, [])).toEqual({
      navbarJoin: true,
      feedSignIn: true,
      forumSignInToPost: true,
      communityJoin: false,
    });
  });
});
