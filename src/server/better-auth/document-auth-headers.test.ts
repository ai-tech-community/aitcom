import { describe, expect, it } from "vitest";

import {
  cookieHeaderForDocumentAuth,
  documentCookiesHaveSessionToken,
  headersForDocumentAuth,
} from "./document-auth-headers";

const TOKEN = "soren-session.signature";
const WWW = "https://www.aitcommunity.org";

describe("cookieHeaderForDocumentAuth", () => {
  it("puts the www __Secure- session cookie on Hub document headers when headers() omitted Cookie", () => {
    const cookie = cookieHeaderForDocumentAuth(null, [
      { name: "__Secure-better-auth.session_token", value: TOKEN },
      { name: "NEXT_LOCALE", value: "en" },
    ]);
    expect(cookie).toContain(`__Secure-better-auth.session_token=${TOKEN}`);
    expect(cookie).toContain(`better-auth.session_token=${TOKEN}`);
    expect(cookie).toContain("NEXT_LOCALE=en");
    expect(
      documentCookiesHaveSessionToken([
        { name: "__Secure-better-auth.session_token", value: TOKEN },
      ]),
    ).toBe(true);
  });

  it("does not invent a session cookie when the document store has none", () => {
    expect(
      cookieHeaderForDocumentAuth("NEXT_LOCALE=en", [
        { name: "NEXT_LOCALE", value: "en" },
      ]),
    ).toBe("NEXT_LOCALE=en");
    expect(
      documentCookiesHaveSessionToken([{ name: "NEXT_LOCALE", value: "en" }]),
    ).toBe(false);
  });

  it("keeps an incoming Cookie header and overlays cookies() so locale cannot hide the session", () => {
    const cookie = cookieHeaderForDocumentAuth("NEXT_LOCALE=nl", [
      { name: "__Secure-better-auth.session_token", value: TOKEN },
    ]);
    expect(cookie).toContain("NEXT_LOCALE=nl");
    expect(cookie).toContain(`__Secure-better-auth.session_token=${TOKEN}`);
  });
});

describe("headersForDocumentAuth", () => {
  it("writes Cookie onto Hub document headers from the cookies() store", () => {
    const incoming = new Headers({
      origin: WWW,
      referer: `${WWW}/en/communities/ait`,
    });
    const headers = headersForDocumentAuth(incoming, [
      { name: "__Secure-better-auth.session_token", value: TOKEN },
    ]);
    expect(incoming.get("cookie")).toBeNull();
    expect(headers.get("cookie")).toContain(
      `__Secure-better-auth.session_token=${TOKEN}`,
    );
  });
});
