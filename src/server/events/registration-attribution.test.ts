import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/db", () => ({ db: {} }));
import { resolveRegistrationAttribution } from "./registration-attribution";
import {
  createSourceToken,
  sourceCookieName,
} from "./registration-source-token";
const secret = "test-secret";
function dbWith(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy"])
    chain[method] = () => chain;
  chain.limit = () => Promise.resolve(rows);
  return { select: () => chain } as never;
}
function headers(source: "luma" | "meetup", eventId = 7) {
  return new Headers({
    cookie: `${sourceCookieName(eventId)}=${createSourceToken(eventId, source, "cookie", secret)}`,
  });
}
describe("registration attribution", () => {
  it("records a tracked first registration without requiring a preexisting session", async () => {
    expect(
      await resolveRegistrationAttribution(
        dbWith([]),
        "new-member",
        7,
        headers("luma"),
        secret,
      ),
    ).toMatchObject({
      registrationSource: "luma",
      attributedAt: expect.any(Date),
    });
  });
  it("preserves the first source after cancellation, despite a new tracked link", async () => {
    const original = {
      registrationSource: "luma",
      attributedAt: new Date("2026-10-01"),
    };
    expect(
      await resolveRegistrationAttribution(
        dbWith([original]),
        "member",
        7,
        headers("meetup"),
        secret,
      ),
    ).toEqual(original);
  });
  it("keeps historical registrations direct/unknown", async () => {
    expect(
      await resolveRegistrationAttribution(
        dbWith([{ attributedAt: null }]),
        "member",
        7,
        headers("meetup"),
        secret,
      ),
    ).toEqual({ registrationSource: "direct_or_unknown", attributedAt: null });
  });
  it("falls back safely for direct, expired and other-event traffic", async () => {
    for (const requestHeaders of [
      new Headers(),
      headers("luma", 8),
      new Headers({
        cookie: `${sourceCookieName(7)}=${createSourceToken(7, "luma", "cookie", secret, 0)}`,
      }),
    ]) {
      expect(
        await resolveRegistrationAttribution(
          dbWith([]),
          "member",
          7,
          requestHeaders,
          secret,
        ),
      ).toEqual({
        registrationSource: "direct_or_unknown",
        attributedAt: null,
      });
    }
  });
});
