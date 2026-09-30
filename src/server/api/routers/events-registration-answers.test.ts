// Router-level test for registration questions (#369): answers are checked
// against the event's questions before anything is written, stored cleaned,
// and can change until the event starts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { findByID: vi.fn() };

const dbResults: unknown[][] = [];
const inserted: unknown[] = [];
const updates: unknown[] = [];

function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy", "returning"]) {
    c[m] = () => c;
  }
  c.values = (row: unknown) => {
    inserted.push(row);
    return c;
  };
  c.set = (values: unknown) => {
    updates.push(values);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    resolve(dbResults.shift() ?? []);
  return c;
}
const fakeDb = {
  select: () => chain(),
  insert: () => chain(),
  update: () => chain(),
};

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));
vi.mock("@/server/mollie", () => ({ getMollie: () => null }));
vi.mock("@/server/agent/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/server/email", () => ({
  sendRegistrationConfirmation: vi.fn(),
  sendCancellationConfirmation: vi.fn(),
  sendWaitlistPromotion: vi.fn(),
  EMAIL_SENDER: { name: "AIT Community", email: "noreply@example.test" },
}));

const { createCaller } = await import("@/server/api/root");

const caller = createCaller({
  db: fakeDb as never,
  session: {
    user: {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    },
    session: { id: "s1" },
  } as never,
  headers: new Headers(),
});

const QUESTIONS = [
  {
    id: "hope",
    type: "long_text",
    label: "What do you hope to learn?",
    required: true,
  },
  {
    id: "level",
    type: "single_choice",
    label: "Your AI experience",
    required: false,
    options: [
      { id: "new", label: "New to it" },
      { id: "pro", label: "Daily" },
    ],
  },
];

const EVENT = {
  id: 7,
  slug: "builders-night",
  title: "Builders night",
  summary: null,
  date: "2099-11-02T00:00:00.000Z",
  startTime: "19:00",
  endTime: "22:00",
  timezone: "Europe/Amsterdam",
  location: "Amsterdam",
  sourceUrl: null,
  status: "published",
  maxAttendees: null,
  price: 0,
  communityId: null,
  registrationQuestions: QUESTIONS,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbResults.length = 0;
  inserted.length = 0;
  updates.length = 0;
  payload.findByID.mockResolvedValue(EVENT);
});

describe("events.register with questions", () => {
  it("stores the cleaned answers with the registration", async () => {
    dbResults.push(
      [], // no existing registration
      [{ firstName: "Ada", lastName: "Lovelace" }], // account names
      [{ count: 0 }],
      [{ id: "r1", status: "registered" }],
      [], // no member profile
    );

    await caller.events.register({
      eventId: 7,
      answers: { hope: "  Ship an agent ", level: "pro", stray: "x" },
    });

    expect(inserted[0]).toMatchObject({
      status: "registered",
      answers: { hope: "Ship an agent", level: "pro" },
    });
  });

  it("refuses a missing required answer before writing anything", async () => {
    dbResults.push([]); // no existing registration

    await expect(
      caller.events.register({ eventId: 7, answers: { level: "new" } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "ANSWERS_INVALID",
    });
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("stores no answers for an event without questions", async () => {
    payload.findByID.mockResolvedValue({
      ...EVENT,
      registrationQuestions: null,
    });
    dbResults.push(
      [],
      [{ firstName: "Ada", lastName: "Lovelace" }],
      [{ count: 0 }],
      [{ id: "r1", status: "registered" }],
      [],
    );

    await caller.events.register({ eventId: 7 });

    expect(inserted[0]).toMatchObject({ answers: {} });
  });
});

describe("events.updateMyAnswers", () => {
  it("replaces the member's answers before the event starts", async () => {
    dbResults.push([{ id: "r1" }]);

    const res = await caller.events.updateMyAnswers({
      eventId: 7,
      answers: { hope: "Evals instead" },
    });

    expect(res).toEqual({ answers: { hope: "Evals instead" } });
    expect(updates).toEqual([{ answers: { hope: "Evals instead" } }]);
  });

  it("refuses once the event has started", async () => {
    payload.findByID.mockResolvedValue({
      ...EVENT,
      date: "2020-01-01T00:00:00.000Z",
    });

    await expect(
      caller.events.updateMyAnswers({ eventId: 7, answers: { hope: "x" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
  });

  it("refuses someone who is not registered", async () => {
    dbResults.push([]);

    await expect(
      caller.events.updateMyAnswers({ eventId: 7, answers: { hope: "x" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updates).toHaveLength(0);
  });

  it("refuses answers that break the rules", async () => {
    dbResults.push([{ id: "r1" }]);

    await expect(
      caller.events.updateMyAnswers({
        eventId: 7,
        answers: { hope: "x", level: "expert" },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "ANSWERS_INVALID",
    });
    expect(updates).toHaveLength(0);
  });

  it("does not exist for an event run on another site", async () => {
    payload.findByID.mockResolvedValue({
      ...EVENT,
      sourceUrl: "https://lu.ma/x",
    });

    await expect(
      caller.events.updateMyAnswers({ eventId: 7, answers: {} }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
