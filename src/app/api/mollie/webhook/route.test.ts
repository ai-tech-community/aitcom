import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendRegistrationConfirmation = vi.fn();
const findByID = vi.fn();
/** Rows each `db.select()…` chain resolves to, in call order. */
const selectResults: unknown[][] = [];

vi.mock("@/server/mollie", () => ({
  getMollie: () => ({
    payments: { get: async () => ({ status: "paid" }) },
  }),
}));

vi.mock("@/server/db/schema", () => ({
  eventRegistrations: { id: "id", paymentId: "paymentId" },
  memberProfiles: { userId: "userId" },
  user: { id: "id", name: "name", email: "email" },
}));

vi.mock("@/server/db", () => {
  const selectChain = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => selectResults.shift() ?? [],
    };
    return chain;
  };
  const updateChain = () => {
    const chain = { set: () => chain, where: async () => undefined };
    return chain;
  };
  return { db: { select: selectChain, update: updateChain } };
});

vi.mock("@/lib/gamification", () => ({
  awardXp: vi.fn(),
  XP_AMOUNTS: { REGISTER_EVENT: 10 },
}));

vi.mock("@/server/email", () => ({ sendRegistrationConfirmation }));

vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({ findByID }),
}));

const { POST } = await import("./route");

function webhookRequest(): Request {
  const body = new FormData();
  body.set("id", "tr_123");
  return new Request("https://example.test/api/mollie/webhook", {
    method: "POST",
    body,
  });
}

describe("Mollie webhook confirmation email", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    sendRegistrationConfirmation.mockReset();
    findByID.mockReset();
    selectResults.length = 0;
    selectResults.push(
      [{ id: 1, userId: "u1", eventId: 7, status: "pending_payment" }],
      [], // no member profile: no XP
      [{ name: "Ada", email: "ada@example.test" }],
    );
    findByID.mockResolvedValue({
      title: "Agents Hackathon",
      date: "2026-10-05T00:00:00.000Z",
      startTime: "10:00",
      endTime: "18:00",
      timezone: "Europe/Amsterdam",
      location: "Utrecht",
      slug: "agents-hackathon",
    });
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("sends the event's own day and its zoned time", async () => {
    // A server west of UTC read the 4th with the old local getters.
    process.env.TZ = "America/Los_Angeles";
    expect(new Date("2026-10-05T00:00:00.000Z").getDate()).toBe(4);

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);

    expect(sendRegistrationConfirmation).toHaveBeenCalledTimes(1);
    expect(sendRegistrationConfirmation).toHaveBeenCalledWith(
      "ada@example.test",
      "Ada",
      {
        eventTitle: "Agents Hackathon",
        eventDate: "5 Oct 2026",
        eventTime: "10:00–18:00 CEST (Europe/Amsterdam)",
        eventLocation: "Utrecht",
        eventSlug: "agents-hackathon",
      },
    );
  });
});
