import { afterEach, describe, expect, it } from "vitest";

import {
  isLinkedinOAuthEnabled,
  readLinkedinOAuthCredentials,
  readProcessEnvValue,
} from "./linkedin-oauth-env";

const ID = "BETTER_AUTH_LINKEDIN_CLIENT_ID";
const SECRET = "BETTER_AUTH_LINKEDIN_CLIENT_SECRET";

const originalId = process.env[ID];
const originalSecret = process.env[SECRET];

afterEach(() => {
  if (originalId === undefined) delete process.env[ID];
  else process.env[ID] = originalId;
  if (originalSecret === undefined) delete process.env[SECRET];
  else process.env[SECRET] = originalSecret;
});

describe("readProcessEnvValue", () => {
  it("reads a computed process.env key and trims", () => {
    process.env[ID] = "  abc  ";
    expect(readProcessEnvValue(ID)).toBe("abc");
  });

  it("treats empty and whitespace as missing", () => {
    process.env[ID] = "";
    expect(readProcessEnvValue(ID)).toBeUndefined();
    process.env[ID] = "   ";
    expect(readProcessEnvValue(ID)).toBeUndefined();
  });
});

describe("readLinkedinOAuthCredentials / isLinkedinOAuthEnabled", () => {
  it("requires both vars", () => {
    delete process.env[ID];
    delete process.env[SECRET];
    expect(readLinkedinOAuthCredentials()).toBeNull();
    expect(isLinkedinOAuthEnabled()).toBe(false);

    process.env[ID] = "id-only";
    delete process.env[SECRET];
    expect(isLinkedinOAuthEnabled()).toBe(false);

    process.env[ID] = "id";
    process.env[SECRET] = "secret";
    expect(readLinkedinOAuthCredentials()).toEqual({
      clientId: "id",
      clientSecret: "secret",
    });
    expect(isLinkedinOAuthEnabled()).toBe(true);
  });
});
