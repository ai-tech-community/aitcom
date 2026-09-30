import { afterEach, describe, expect, it } from "vitest";

import {
  OAUTH_PROVIDERS,
  canDisconnectProvider,
  enabledOAuthProviders,
  isOAuthProvider,
  isOAuthProviderEnabled,
  mapOAuthProviders,
  readOAuthCredentials,
  readProcessEnvValue,
} from "./oauth-providers";

const ENV_NAMES = [
  "BETTER_AUTH_GITHUB_CLIENT_ID",
  "BETTER_AUTH_GITHUB_CLIENT_SECRET",
  "BETTER_AUTH_LINKEDIN_CLIENT_ID",
  "BETTER_AUTH_LINKEDIN_CLIENT_SECRET",
  "BETTER_AUTH_GOOGLE_CLIENT_ID",
  "BETTER_AUTH_GOOGLE_CLIENT_SECRET",
] as const;

const original = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);

function clearOAuthEnv() {
  for (const name of ENV_NAMES) delete process.env[name];
}

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("readProcessEnvValue", () => {
  it("reads a computed process.env key and trims", () => {
    process.env.BETTER_AUTH_LINKEDIN_CLIENT_ID = "  abc  ";
    expect(readProcessEnvValue("BETTER_AUTH_LINKEDIN_CLIENT_ID")).toBe("abc");
  });

  it("treats empty and whitespace as missing", () => {
    process.env.BETTER_AUTH_LINKEDIN_CLIENT_ID = "";
    expect(
      readProcessEnvValue("BETTER_AUTH_LINKEDIN_CLIENT_ID"),
    ).toBeUndefined();
    process.env.BETTER_AUTH_LINKEDIN_CLIENT_ID = "   ";
    expect(
      readProcessEnvValue("BETTER_AUTH_LINKEDIN_CLIENT_ID"),
    ).toBeUndefined();
  });
});

describe("readOAuthCredentials / isOAuthProviderEnabled", () => {
  it.each([
    [
      "github",
      "BETTER_AUTH_GITHUB_CLIENT_ID",
      "BETTER_AUTH_GITHUB_CLIENT_SECRET",
    ],
    [
      "linkedin",
      "BETTER_AUTH_LINKEDIN_CLIENT_ID",
      "BETTER_AUTH_LINKEDIN_CLIENT_SECRET",
    ],
    [
      "google",
      "BETTER_AUTH_GOOGLE_CLIENT_ID",
      "BETTER_AUTH_GOOGLE_CLIENT_SECRET",
    ],
  ] as const)(
    "%s requires both of its env vars",
    (provider, idName, secretName) => {
      clearOAuthEnv();
      expect(readOAuthCredentials(provider)).toBeNull();
      expect(isOAuthProviderEnabled(provider)).toBe(false);

      process.env[idName] = "id-only";
      expect(isOAuthProviderEnabled(provider)).toBe(false);

      process.env[secretName] = " secret ";
      expect(readOAuthCredentials(provider)).toEqual({
        clientId: "id-only",
        clientSecret: "secret",
      });
      expect(isOAuthProviderEnabled(provider)).toBe(true);
    },
  );

  it("does not let one provider's keys enable another", () => {
    clearOAuthEnv();
    process.env.BETTER_AUTH_GOOGLE_CLIENT_ID = "id";
    process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET = "secret";
    expect(enabledOAuthProviders()).toEqual({
      google: true,
      github: false,
      linkedin: false,
    });
  });
});

describe("OAUTH_PROVIDERS", () => {
  it("lists Google first so the most common sign-in leads", () => {
    expect(OAUTH_PROVIDERS).toEqual(["google", "github", "linkedin"]);
  });

  it("isOAuthProvider accepts only registered ids", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("credential")).toBe(false);
  });

  it("mapOAuthProviders builds one entry per provider", () => {
    expect(mapOAuthProviders((provider) => provider.length)).toEqual({
      google: 6,
      github: 6,
      linkedin: 8,
    });
  });
});

describe("canDisconnectProvider", () => {
  it("blocks disconnecting GitHub when it is the only sign-in method", () => {
    expect(canDisconnectProvider("github", [{ providerId: "github" }])).toEqual(
      { ok: false, reason: "last_sign_in" },
    );
  });

  it("allows disconnecting GitHub when LinkedIn remains as a sign-in", () => {
    expect(
      canDisconnectProvider("github", [
        { providerId: "github" },
        { providerId: "linkedin" },
      ]),
    ).toEqual({ ok: true });
  });

  it("allows disconnecting GitHub when a password exists", () => {
    expect(
      canDisconnectProvider("github", [
        { providerId: "github" },
        { providerId: "credential" },
      ]),
    ).toEqual({ ok: true });
  });

  it("blocks disconnecting LinkedIn when it is the only sign-in method", () => {
    expect(
      canDisconnectProvider("linkedin", [{ providerId: "linkedin" }]),
    ).toEqual({ ok: false, reason: "last_sign_in" });
  });

  it("blocks disconnecting Google when it is the only sign-in method", () => {
    expect(canDisconnectProvider("google", [{ providerId: "google" }])).toEqual(
      { ok: false, reason: "last_sign_in" },
    );
  });

  it("allows disconnecting Google when GitHub remains", () => {
    expect(
      canDisconnectProvider("google", [
        { providerId: "google" },
        { providerId: "github" },
      ]),
    ).toEqual({ ok: true });
  });
});
