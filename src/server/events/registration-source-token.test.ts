import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_SECONDS,
  createSourceToken,
  readSourceToken,
  sourceCookieName,
  sourceFromHeaders,
} from "./registration-source-token";
const SECRET = "test-attribution-secret";
const NOW = 1791972000000;

describe("tracked registration links", () => {
  it("resolves an event-bound link on a later visit", () => {
    const token = createSourceToken(7, "luma", "link", SECRET, NOW);
    expect(readSourceToken(token, SECRET, NOW + 30 * 86400000)).toMatchObject({
      eventId: 7,
      source: "luma",
      purpose: "link",
    });
  });
  it("rejects tampering, wrong keys, malformed tokens and future captures", () => {
    const token = createSourceToken(7, "meetup", "cookie", SECRET, NOW);
    expect(readSourceToken(`A${token.slice(1, -1)}`, SECRET, NOW)).toBeNull();
    expect(readSourceToken(token, "another-secret", NOW)).toBeNull();
    expect(readSourceToken("not-a-token", SECRET, NOW)).toBeNull();
    expect(readSourceToken(token, SECRET, NOW - 1)).toBeNull();
  });
  it("expires cookie attribution after seven days without trusting browser expiry", () => {
    const token = createSourceToken(7, "eventbrite", "cookie", SECRET, NOW);
    expect(
      readSourceToken(token, SECRET, NOW + ATTRIBUTION_SECONDS * 1000 - 1)
        ?.source,
    ).toBe("eventbrite");
    expect(
      readSourceToken(token, SECRET, NOW + ATTRIBUTION_SECONDS * 1000),
    ).toBeNull();
  });
  it("isolates events and rejects link tokens used as cookies", () => {
    const cookie = (token: string) =>
      new Headers({ cookie: `${sourceCookieName(7)}=${token}` });
    expect(
      sourceFromHeaders(
        cookie(createSourceToken(8, "luma", "cookie", SECRET, NOW)),
        7,
        SECRET,
        NOW,
      ),
    ).toBeNull();
    expect(
      sourceFromHeaders(
        cookie(createSourceToken(7, "luma", "link", SECRET, NOW)),
        7,
        SECRET,
        NOW,
      ),
    ).toBeNull();
    expect(
      sourceFromHeaders(
        cookie(createSourceToken(7, "meetup", "cookie", SECRET, NOW)),
        7,
        SECRET,
        NOW,
      )?.source,
    ).toBe("meetup");
  });
});
