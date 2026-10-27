// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  findMagazineForViewer: vi.fn(),
  subscribeByEmail: vi.fn(),
  mailer: { recipient: (to: string) => to, send: vi.fn() },
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/server/api/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return {
    createTRPCRouter: t.router,
    publicProcedure: t.procedure,
    protectedProcedure: t.procedure,
  };
});
vi.mock("@/server/magazines/reading", () => ({
  findMagazineForViewer: mocks.findMagazineForViewer,
  findMagazineBySlug: vi.fn(),
}));
vi.mock("@/server/magazines/subscriptions/service", () => ({
  subscribeByEmail: mocks.subscribeByEmail,
  subscribeAccount: vi.fn(),
  unsubscribeAccount: vi.fn(),
  isAccountSubscribed: vi.fn(),
}));
vi.mock("@/server/magazines/subscriptions/mail", () => ({
  defaultMagazineMailer: () => mocks.mailer,
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({}),
}));

import { magazineSubscriptionsRouter } from "./magazine-subscriptions";

let nextIp = 0;
function caller(afterResponse?: (task: () => Promise<void>) => void) {
  return magazineSubscriptionsRouter.createCaller({
    db: {},
    session: null,
    headers: new Headers({
      "x-forwarded-for": `subscription-unit-${nextIp++}`,
    }),
    afterResponse,
  } as never);
}

const input = {
  magazineSlug: "garden-news",
  email: "private-reader@example.test",
  locale: "en" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMagazineForViewer.mockResolvedValue({
    magazine: { id: 7, name: "Garden news" },
  });
  mocks.subscribeByEmail.mockResolvedValue(undefined);
});

describe("magazineSubscriptions.subscribeByEmail", () => {
  it("returns the same answer before any subscription work is run", async () => {
    const scheduled: Array<() => Promise<void>> = [];
    const api = caller((task) => scheduled.push(task));

    await expect(api.subscribeByEmail(input)).resolves.toEqual({ ok: true });
    expect(scheduled).toHaveLength(1);
    expect(mocks.subscribeByEmail).not.toHaveBeenCalled();

    let finish!: () => void;
    mocks.subscribeByEmail.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const work = scheduled[0]!();
    expect(mocks.subscribeByEmail).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        magazine: { id: 7, name: "Garden news" },
        email: input.email,
        locale: input.locale,
      },
      mocks.mailer,
      expect.any(Date),
    );
    finish();
    await work;
  });

  it("uses Next after by default", async () => {
    await expect(caller().subscribeByEmail(input)).resolves.toEqual({
      ok: true,
    });
    expect(mocks.after).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(mocks.subscribeByEmail).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.subscribeByEmail).toHaveBeenCalledTimes(1);
  });

  it("logs a scheduled failure without the address or exception", async () => {
    const scheduled: Array<() => Promise<void>> = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mocks.subscribeByEmail.mockRejectedValueOnce(new Error(input.email));
      await expect(
        caller((task) => scheduled.push(task)).subscribeByEmail(input),
      ).resolves.toEqual({ ok: true });
      await expect(scheduled[0]!()).resolves.toBeUndefined();
      expect(log.mock.calls).toEqual([
        ["[magazines] email subscription failed"],
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it("checks visibility before scheduling", async () => {
    const schedule = vi.fn();
    mocks.findMagazineForViewer.mockResolvedValueOnce(null);
    await expect(
      caller(schedule).subscribeByEmail(input),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(schedule).not.toHaveBeenCalled();
    expect(mocks.subscribeByEmail).not.toHaveBeenCalled();
  });

  it("checks the IP limit before scheduling", async () => {
    const schedule = vi.fn();
    const api = caller(schedule);
    for (let i = 0; i < 10; i++) await api.subscribeByEmail(input);
    await expect(api.subscribeByEmail(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(schedule).toHaveBeenCalledTimes(10);
    expect(mocks.findMagazineForViewer).toHaveBeenCalledTimes(10);
    expect(mocks.subscribeByEmail).not.toHaveBeenCalled();
  });
});
