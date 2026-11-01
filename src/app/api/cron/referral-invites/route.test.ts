// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  clean: vi.fn(),
  reminders: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/referral-email/service", () => ({
  cleanReferralEmails: mock.clean,
}));
vi.mock("@/server/communities/referral-email/dispatch", () => ({
  queueReferralReminders: mock.reminders,
  dispatchReferralEmails: mock.dispatch,
}));
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron");
  mock.clean.mockResolvedValue(3);
  mock.reminders.mockResolvedValue(0);
  mock.dispatch.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());
describe("referral queue cron authentication and privacy cleanup", () => {
  it("rejects missing or incorrect authorization without touching storage", async () => {
    expect((await GET(new Request("https://example.test/cron"))).status).toBe(
      401,
    );
    expect(mock.clean).not.toHaveBeenCalled();
  });
  it("does not accept Bearer undefined when the secret is unconfigured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(
      (
        await GET(
          new Request("https://example.test/cron", {
            headers: { authorization: "Bearer undefined" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(mock.clean).not.toHaveBeenCalled();
  });
  it("cleans addresses even when the mail gates decline work", async () => {
    const response = await GET(
      new Request("https://example.test/cron", {
        headers: { authorization: "Bearer test-cron" },
      }),
    );
    expect(await response.json()).toEqual({
      cleaned: 3,
      reminders: 0,
      processed: 0,
    });
    expect(mock.clean).toHaveBeenCalledExactlyOnceWith({});
  });
});
