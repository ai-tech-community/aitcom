import { describe, expect, it } from "vitest";

import {
  canDisconnectProvider,
  decodeJwtPayload,
  githubProfileUrl,
  isLinkedinOAuthConfigured,
  isSocialProvider,
  linkedinIdentityFromIdToken,
  parseGithubHandle,
  parseLinkedinPublicUrl,
  presentPublicSocials,
} from "./social-identity";

describe("parseGithubHandle", () => {
  it("parses github.com URLs", () => {
    expect(parseGithubHandle("https://github.com/UretzkyZvi")).toBe(
      "UretzkyZvi",
    );
    expect(parseGithubHandle("https://www.github.com/UretzkyZvi/repo")).toBe(
      "UretzkyZvi",
    );
  });

  it("parses @handles and bare logins", () => {
    expect(parseGithubHandle("@octocat")).toBe("octocat");
    expect(parseGithubHandle("octocat")).toBe("octocat");
  });

  it("rejects junk", () => {
    expect(parseGithubHandle("")).toBeNull();
    expect(parseGithubHandle("https://gitlab.com/octocat")).toBeNull();
    expect(parseGithubHandle("not a handle!!")).toBeNull();
  });
});

describe("parseLinkedinPublicUrl", () => {
  it("normalizes public profile URLs", () => {
    expect(parseLinkedinPublicUrl("https://linkedin.com/in/uretzkyzvi")).toBe(
      "https://www.linkedin.com/in/uretzkyzvi",
    );
    expect(
      parseLinkedinPublicUrl("https://www.linkedin.com/in/uretzkyzvi/"),
    ).toBe("https://www.linkedin.com/in/uretzkyzvi");
  });

  it("rejects non-profile LinkedIn URLs", () => {
    expect(
      parseLinkedinPublicUrl("https://linkedin.com/company/ait"),
    ).toBeNull();
    expect(parseLinkedinPublicUrl("https://example.com/in/x")).toBeNull();
  });
});

describe("githubProfileUrl", () => {
  it("builds the canonical profile URL", () => {
    expect(githubProfileUrl("octocat")).toBe("https://github.com/octocat");
  });
});

describe("decodeJwtPayload / linkedinIdentityFromIdToken", () => {
  const payload = Buffer.from(
    JSON.stringify({ sub: "linkedin-sub-1", name: "Soren Ravn" }),
  ).toString("base64url");
  const token = `hdr.${payload}.sig`;

  it("decodes a JWT payload without verifying the signature", () => {
    expect(decodeJwtPayload(token)).toEqual({
      sub: "linkedin-sub-1",
      name: "Soren Ravn",
    });
  });

  it("extracts LinkedIn sub + name", () => {
    expect(linkedinIdentityFromIdToken(token)).toEqual({
      sub: "linkedin-sub-1",
      name: "Soren Ravn",
    });
  });

  it("returns null for garbage", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(linkedinIdentityFromIdToken(null)).toBeNull();
  });
});

describe("isLinkedinOAuthConfigured", () => {
  it("requires both env vars", () => {
    expect(isLinkedinOAuthConfigured({})).toBe(false);
    expect(
      isLinkedinOAuthConfigured({ BETTER_AUTH_LINKEDIN_CLIENT_ID: "id" }),
    ).toBe(false);
    expect(
      isLinkedinOAuthConfigured({
        BETTER_AUTH_LINKEDIN_CLIENT_ID: "id",
        BETTER_AUTH_LINKEDIN_CLIENT_SECRET: "secret",
      }),
    ).toBe(true);
  });
});

describe("isSocialProvider", () => {
  it("accepts github and linkedin only", () => {
    expect(isSocialProvider("github")).toBe(true);
    expect(isSocialProvider("linkedin")).toBe(true);
    expect(isSocialProvider("google")).toBe(false);
  });
});

describe("canDisconnectProvider", () => {
  it("blocks disconnecting GitHub when it is the only sign-in method", () => {
    expect(canDisconnectProvider("github", [{ providerId: "github" }])).toEqual(
      { ok: false, reason: "last_sign_in" },
    );
  });

  it("ignores LinkedIn when deciding whether GitHub is the last sign-in", () => {
    expect(
      canDisconnectProvider("github", [
        { providerId: "github" },
        { providerId: "linkedin" },
      ]),
    ).toEqual({ ok: false, reason: "last_sign_in" });
  });

  it("allows disconnecting GitHub when a password exists", () => {
    expect(
      canDisconnectProvider("github", [
        { providerId: "github" },
        { providerId: "credential" },
      ]),
    ).toEqual({ ok: true });
  });

  it("always allows disconnecting LinkedIn", () => {
    expect(
      canDisconnectProvider("linkedin", [{ providerId: "linkedin" }]),
    ).toEqual({ ok: true });
  });
});

describe("presentPublicSocials", () => {
  const githubIdentity = {
    provider: "github" as const,
    providerAccountId: "123",
    handle: "UretzkyZvi",
    profileUrl: "https://github.com/UretzkyZvi",
  };
  const linkedinIdentity = {
    provider: "linkedin" as const,
    providerAccountId: "sub-1",
    handle: "Greg Uretzky",
    profileUrl: null,
  };

  it("prefers verified GitHub over a pasted URL", () => {
    const result = presentPublicSocials({
      identities: [githubIdentity],
      pasted: { githubUrl: "https://github.com/someone-else" },
      subject: "member",
    });
    expect(result.github).toEqual({
      provider: "github",
      handle: "UretzkyZvi",
      url: "https://github.com/UretzkyZvi",
      verified: true,
    });
  });

  it("shows an unverified pasted GitHub URL when OAuth is missing", () => {
    const result = presentPublicSocials({
      identities: [],
      pasted: { githubUrl: "https://github.com/SorenRavn" },
      subject: "member",
    });
    expect(result.github).toMatchObject({
      handle: "SorenRavn",
      verified: false,
    });
  });

  it("marks LinkedIn verified from OAuth and may reuse a pasted public URL", () => {
    const result = presentPublicSocials({
      identities: [linkedinIdentity],
      pasted: { linkedinUrl: "https://www.linkedin.com/in/uretzkyzvi" },
      subject: "member",
    });
    expect(result.linkedin).toEqual({
      provider: "linkedin",
      handle: "Greg Uretzky",
      url: "https://www.linkedin.com/in/uretzkyzvi",
      verified: true,
    });
  });

  it("never presents LinkedIn on an agent subject, even if the owner connected it", () => {
    const result = presentPublicSocials({
      identities: [githubIdentity, linkedinIdentity],
      pasted: {
        githubUrl: "https://github.com/UretzkyZvi",
        linkedinUrl: "https://www.linkedin.com/in/uretzkyzvi",
        websiteUrl: "https://klevox.com",
      },
      subject: "agent",
    });
    expect(result.github?.verified).toBe(true);
    expect(result.linkedin).toBeNull();
    expect(result.website).toBeNull();
  });

  it("fills a missing GitHub handle from a pasted URL when OAuth is connected", () => {
    const result = presentPublicSocials({
      identities: [
        {
          provider: "github",
          providerAccountId: "99",
          handle: null,
          profileUrl: null,
        },
      ],
      pasted: { githubUrl: "https://github.com/octocat" },
      subject: "member",
    });
    expect(result.github).toEqual({
      provider: "github",
      handle: "octocat",
      url: "https://github.com/octocat",
      verified: true,
    });
  });
});
