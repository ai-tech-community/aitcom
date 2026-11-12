import type { db as Database } from "@/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
  connect: vi.fn(),
  refund: vi.fn(),
  cancel: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock("@/server/api/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC
    .context<{
      db: typeof Database;
      session: { user: { id: string; email: string } } | null;
      community: { id: string; slug: string; name: string };
      communityRole: "owner" | "admin" | "moderator" | "member" | null;
      headers: Headers;
    }>()
    .create();
  const authenticated = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx: { ...ctx, session: ctx.session } });
  });
  return {
    createTRPCRouter: t.router,
    communityProcedure: authenticated,
    protectedProcedure: authenticated,
    publicProcedure: t.procedure,
  };
});
vi.mock("@/server/payments/connections", () => ({
  connectProvider: services.connect,
  summarizeConnection: (provider: "stripe" | "adyen") => ({
    provider,
    available: false,
    connected: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    accountLabel: null,
    environment: "test",
  }),
  ownedConnection: vi.fn(),
  refreshConnection: vi.fn(),
  selectConnection: vi.fn(),
}));
vi.mock("@/server/payments/management", () => ({
  refundPayment: services.refund,
  cancelPaymentSubscription: services.cancel,
}));
vi.mock("@/server/payments/checkout", () => ({
  startCheckout: services.checkout,
  assertSellableResource: vi.fn(),
}));
vi.mock("@/server/payments/billing-scheduler", () => ({
  recoverAdyenSubscription: vi.fn(),
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
import { communityPaymentsRouter } from "./community-payments";

function caller(
  role: "owner" | "admin" | "moderator" | "member" | null,
  signedIn = true,
) {
  return communityPaymentsRouter.createCaller({
    db: {} as never,
    community: { id: "community-A", slug: "alpha", name: "Alpha" },
    communityRole: role,
    session: signedIn
      ? { user: { id: "user-current", email: "current@example.com" } }
      : null,
    headers: new Headers(),
  } as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  services.connect.mockResolvedValue({
    url: "https://connect.stripe.com/example",
  });
  services.refund.mockResolvedValue({ ok: true });
  services.cancel.mockResolvedValue({ ok: true });
});

describe("community payment authority", () => {
  it.each(["admin", "moderator", "member", null] as const)(
    "does not grant financial control to %s",
    async (role) => {
      await expect(
        caller(role).connect({
          slug: "alpha",
          provider: "stripe",
          country: "NL",
          entityType: "organization",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(services.connect).not.toHaveBeenCalled();
    },
  );
  it("requires authentication even if a forged context claims ownership", async () => {
    await expect(
      caller("owner", false).overview({ slug: "alpha" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("uses resolved community and current owner identity when connecting", async () => {
    await caller("owner").connect({
      slug: "alpha",
      provider: "stripe",
      country: "NL",
      entityType: "organization",
    });
    expect(services.connect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        communityId: "community-A",
        ownerId: "user-current",
        name: "Alpha",
      }),
    );
  });
  it("scopes refunds to the resolved community rather than buyer-supplied account identifiers", async () => {
    const orderId = "10000000-0000-4000-8000-000000000001";
    await caller("owner").refund({ slug: "alpha", orderId });
    expect(services.refund).toHaveBeenCalledWith(
      expect.anything(),
      "community-A",
      "user-current",
      orderId,
    );
  });
  it("passes the authenticated actor into member cancellation", async () => {
    const subscriptionId = "10000000-0000-4000-8000-000000000002";
    await caller("member").cancel({ subscriptionId });
    expect(services.cancel).toHaveBeenCalledWith(
      expect.anything(),
      "user-current",
      subscriptionId,
    );
  });
});
