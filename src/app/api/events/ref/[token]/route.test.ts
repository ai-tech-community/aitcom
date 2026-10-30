import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "test-secret",
    NEXT_PUBLIC_APP_URL: "https://app.test",
    NODE_ENV: "production",
  },
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({ findByID: m.find }),
}));
import { GET } from "./route";
import {
  createSourceToken,
  readSourceToken,
  sourceCookieName,
} from "@/server/events/registration-source-token";
const event = {
  id: 7,
  status: "published",
  communityId: "c1",
  slug: "builders-night",
  sourceUrl: null,
  price: 0,
};
async function visit(
  token = createSourceToken(7, "luma", "link", "test-secret"),
) {
  return GET(
    new Request(`https://untrusted.test/api/events/ref/${token}?locale=nl`),
    { params: Promise.resolve({ token }) },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.find.mockResolvedValue(event);
});
describe("tracked registration redirect", () => {
  it("sets attribution before authentication and redirects only to the configured app", async () => {
    const response = await visit();
    expect(response.headers.get("location")).toBe(
      "https://app.test/nl/events/builders-night",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    const cookie = response.cookies.get(sourceCookieName(7))!;
    expect(readSourceToken(cookie.value, "test-secret")).toMatchObject({
      eventId: 7,
      source: "luma",
      purpose: "cookie",
    });
  });
  it("rejects invalid tokens without fetching an event or replacing attribution", async () => {
    const response = await visit("invalid");
    expect(response.headers.get("location")).toBe("https://app.test/nl/events");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(m.find).not.toHaveBeenCalled();
  });
  it.each([
    { status: "draft" },
    { price: 100 },
    { sourceUrl: "https://outside.test" },
    { communityId: null },
  ])("does not track ineligible events: %j", async (changes) => {
    m.find.mockResolvedValue({ ...event, ...changes });
    const response = await visit();
    expect(response.headers.get("location")).toBe("https://app.test/nl/events");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
