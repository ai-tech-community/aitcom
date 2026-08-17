export const SOCIAL_PROVIDERS = ["github", "linkedin"] as const;

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export type VerifiedSocialIdentity = {
  provider: SocialProvider;
  providerAccountId: string;
  handle: string | null;
  profileUrl: string | null;
};

export type PastedSocialUrls = {
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
};

export type PublicSocialLink = {
  provider: SocialProvider | "website";
  handle: string | null;
  url: string | null;
  verified: boolean;
};

export type PublicSocialPresentation = {
  github: PublicSocialLink | null;
  linkedin: PublicSocialLink | null;
  website: PublicSocialLink | null;
};

const GITHUB_HANDLE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

export function githubProfileUrl(handle: string): string {
  return `https://github.com/${handle}`;
}

/** Extract a GitHub login from a URL, @handle, or bare handle. */
export function parseGithubHandle(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  try {
    const url = new URL(
      withoutAt.includes("://") ? withoutAt : `https://${withoutAt}`,
    );
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "github.com" || host === "www.github.com") {
      const segment = url.pathname.split("/").find(Boolean);
      if (segment && GITHUB_HANDLE_RE.test(segment)) return segment;
      return null;
    }
  } catch {
    // not a URL — treat as a bare handle below
  }

  if (GITHUB_HANDLE_RE.test(withoutAt) && !withoutAt.includes("/")) {
    return withoutAt;
  }
  return null;
}

/** Accept only public LinkedIn profile URLs (`linkedin.com/in/...`). */
export function parseLinkedinPublicUrl(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "linkedin.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "in" || !parts[1]) return null;
    return `https://www.linkedin.com/in/${parts[1]}`;
  } catch {
    return null;
  }
}

export function decodeJwtPayload(
  token: string | null | undefined,
): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = Buffer.from(padded + "=".repeat(padLen), "base64").toString(
      "utf8",
    );
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function linkedinIdentityFromIdToken(
  idToken: string | null | undefined,
): {
  sub: string;
  name: string | null;
} | null {
  const payload = decodeJwtPayload(idToken);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  return {
    sub: payload.sub,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export function isLinkedinOAuthConfigured(env: {
  BETTER_AUTH_LINKEDIN_CLIENT_ID?: string;
  BETTER_AUTH_LINKEDIN_CLIENT_SECRET?: string;
}): boolean {
  return Boolean(
    env.BETTER_AUTH_LINKEDIN_CLIENT_ID &&
    env.BETTER_AUTH_LINKEDIN_CLIENT_SECRET,
  );
}

/**
 * GitHub/LinkedIn may be disconnected only when another sign-in method remains.
 * LinkedIn is a verification provider (not a sign-in method in the UI), so it
 * is always safe to disconnect.
 */
export function canDisconnectProvider(
  provider: SocialProvider,
  accounts: { providerId: string }[],
): { ok: true } | { ok: false; reason: "last_sign_in" } {
  if (provider === "linkedin") return { ok: true };

  const remainingSignIn = accounts.filter((account) => {
    if (account.providerId === provider) return false;
    // LinkedIn is verification-only and cannot keep the user signed in.
    if (account.providerId === "linkedin") return false;
    return true;
  });

  if (remainingSignIn.length === 0) {
    return { ok: false, reason: "last_sign_in" };
  }
  return { ok: true };
}

export function presentPublicSocials(opts: {
  identities: VerifiedSocialIdentity[];
  pasted: PastedSocialUrls;
  /** Agents may show GitHub; they never present a verified human LinkedIn. */
  subject: "member" | "agent";
}): PublicSocialPresentation {
  const githubIdentity = opts.identities.find((i) => i.provider === "github");
  const linkedinIdentity =
    opts.subject === "agent"
      ? undefined
      : opts.identities.find((i) => i.provider === "linkedin");

  const pastedGithubHandle = parseGithubHandle(opts.pasted.githubUrl);
  const pastedLinkedinUrl = parseLinkedinPublicUrl(opts.pasted.linkedinUrl);

  let github: PublicSocialLink | null = null;
  if (githubIdentity) {
    const handle = githubIdentity.handle ?? pastedGithubHandle;
    const url =
      githubIdentity.profileUrl ??
      (handle ? githubProfileUrl(handle) : (opts.pasted.githubUrl ?? null));
    github = {
      provider: "github",
      handle,
      url,
      verified: true,
    };
  } else if (opts.subject === "member" && opts.pasted.githubUrl) {
    github = {
      provider: "github",
      handle: pastedGithubHandle,
      url: opts.pasted.githubUrl,
      verified: false,
    };
  }

  let linkedin: PublicSocialLink | null = null;
  if (linkedinIdentity) {
    linkedin = {
      provider: "linkedin",
      handle: linkedinIdentity.handle,
      url: linkedinIdentity.profileUrl ?? pastedLinkedinUrl,
      verified: true,
    };
  } else if (opts.subject === "member" && opts.pasted.linkedinUrl) {
    linkedin = {
      provider: "linkedin",
      handle: null,
      url: opts.pasted.linkedinUrl,
      verified: false,
    };
  }

  const website =
    opts.subject === "member" && opts.pasted.websiteUrl
      ? {
          provider: "website" as const,
          handle: null,
          url: opts.pasted.websiteUrl,
          verified: false,
        }
      : null;

  return { github, linkedin, website };
}
