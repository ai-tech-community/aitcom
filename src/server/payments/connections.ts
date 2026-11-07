import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import {
  communityMemberships,
  paymentConnections,
  paymentPolicies,
  paymentSubscriptions,
} from "@/server/db/schema";
import type { PaymentProvider, ProviderSummary } from "@/lib/payments";
import {
  adyenAccount,
  adyenAccountHolder,
  adyenBalanceAccount,
  adyenBusinessLine,
  adyenConfigured,
  adyenLegalEntity,
  adyenOnboarding,
  adyenPrepareStore,
} from "./providers/adyen";
import {
  exchangeStripeCode,
  stripeAccount,
  stripeConfigured,
  stripeConnectUrl,
} from "./providers/stripe";
import { paymentAppUrl } from "./providers/http";
import { paymentsEnabled } from "./access";

export type PaymentConnection = typeof paymentConnections.$inferSelect;
export function providerAvailable(provider: PaymentProvider) {
  return (
    paymentsEnabled() &&
    (provider === "stripe" ? stripeConfigured() : adyenConfigured())
  );
}
export function providerEnvironment(
  provider: PaymentProvider,
): "test" | "live" {
  return provider === "stripe"
    ? process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
      ? "live"
      : "test"
    : process.env.ADYEN_ENVIRONMENT === "live"
      ? "live"
      : "test";
}

export function summarizeConnection(
  provider: PaymentProvider,
  connection?: PaymentConnection,
): ProviderSummary {
  return {
    provider,
    available: providerAvailable(provider),
    connected: !!connection?.accountId,
    chargesEnabled: !!connection?.chargesEnabled,
    payoutsEnabled: !!connection?.payoutsEnabled,
    accountLabel: connection?.accountLabel ?? null,
    environment: providerEnvironment(provider),
  };
}

export async function ownedConnection(
  database: typeof db,
  communityId: string,
  ownerId: string,
  provider: PaymentProvider,
) {
  const [connection] = await database
    .select()
    .from(paymentConnections)
    .where(
      and(
        eq(paymentConnections.communityId, communityId),
        eq(paymentConnections.provider, provider),
        isNull(paymentConnections.disconnectedAt),
      ),
    )
    .limit(1);
  if (connection && connection.ownerId !== ownerId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Financial account authority must be resolved after ownership transfer.",
    });
  return connection;
}

export async function refreshConnection(
  database: typeof db,
  connection: PaymentConnection,
) {
  if (!connection.accountId) return connection;
  let patch: Partial<PaymentConnection>;
  if (connection.provider === "stripe") {
    const account = await stripeAccount(connection.accountId);
    patch = {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      accountLabel:
        account.business_profile?.name ?? account.email ?? account.id,
    };
  } else {
    const account = await adyenAccount(connection.accountId);
    const storeId =
      connection.storeId ??
      (connection.legalEntityId && connection.businessLineId
        ? await adyenPrepareStore(connection)
        : null);
    patch = {
      storeId,
      chargesEnabled:
        !!storeId &&
        account.capabilities?.receivePayments?.allowed === true &&
        account.capabilities?.receiveFromPlatformPayments?.allowed === true,
      payoutsEnabled:
        account.capabilities?.sendToTransferInstrument?.allowed === true,
      accountLabel: account.description ?? account.id,
    };
  }
  const [updated] = await database
    .update(paymentConnections)
    .set(patch)
    .where(eq(paymentConnections.id, connection.id))
    .returning();
  return updated!;
}

export async function connectProvider(
  database: typeof db,
  input: {
    communityId: string;
    slug: string;
    ownerId: string;
    provider: PaymentProvider;
    country: string;
    entityType: "individual" | "organization";
    name: string;
  },
) {
  if (!providerAvailable(input.provider))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This provider is not available.",
    });
  let connection = await ownedConnection(
    database,
    input.communityId,
    input.ownerId,
    input.provider,
  );
  if (!connection) {
    const [created] = await database
      .insert(paymentConnections)
      .values({
        communityId: input.communityId,
        ownerId: input.ownerId,
        provider: input.provider,
        country: input.country,
        environment: providerEnvironment(input.provider),
      })
      .onConflictDoNothing()
      .returning();
    connection =
      created ??
      (await ownedConnection(
        database,
        input.communityId,
        input.ownerId,
        input.provider,
      ));
  }
  if (!connection) throw new TRPCError({ code: "CONFLICT" });
  const returnUrl = `${paymentAppUrl()}/communities/${encodeURIComponent(input.slug)}/settings/payments`;
  if (input.provider === "stripe") {
    const state = randomBytes(32).toString("base64url");
    await database
      .update(paymentConnections)
      .set({
        stateHash: createHash("sha256").update(state).digest("hex"),
        stateExpiresAt: new Date(Date.now() + 15 * 60000),
      })
      .where(eq(paymentConnections.id, connection.id));
    return {
      url: stripeConnectUrl(
        `${connection.id}.${state}`,
        `${paymentAppUrl()}/api/payments/stripe/connect`,
      ),
    };
  }
  const [current] = await database
    .select()
    .from(paymentConnections)
    .where(eq(paymentConnections.id, connection.id));
  if (!current) throw new TRPCError({ code: "NOT_FOUND" });
  if (!current.legalEntityId) {
    current.legalEntityId = (
      await adyenLegalEntity(
        input.entityType,
        current.country,
        `legal-${current.id}`,
      )
    ).id;
    await database
      .update(paymentConnections)
      .set({ legalEntityId: current.legalEntityId })
      .where(eq(paymentConnections.id, current.id));
  }
  if (!current.accountId) {
    current.accountId = (
      await adyenAccountHolder(
        current.legalEntityId,
        input.name,
        `holder-${current.id}`,
      )
    ).id;
    await database
      .update(paymentConnections)
      .set({ accountId: current.accountId })
      .where(eq(paymentConnections.id, current.id));
  }
  if (!current.balanceAccountId) {
    current.balanceAccountId = (
      await adyenBalanceAccount(current.accountId, `balance-${current.id}`)
    ).id;
    await database
      .update(paymentConnections)
      .set({ balanceAccountId: current.balanceAccountId })
      .where(eq(paymentConnections.id, current.id));
  }
  if (!current.businessLineId) {
    current.businessLineId = (
      await adyenBusinessLine(
        current.legalEntityId,
        `${paymentAppUrl()}/communities/${encodeURIComponent(input.slug)}`,
        `business-${current.id}`,
      )
    ).id;
    await database
      .update(paymentConnections)
      .set({ businessLineId: current.businessLineId })
      .where(eq(paymentConnections.id, current.id));
  }
  return adyenOnboarding(current.legalEntityId, returnUrl);
}

export async function finishStripeConnect(
  database: typeof db,
  state: string,
  code: string,
  ownerId: string,
) {
  const [id, nonce] = state.split(".");
  if (!id || !nonce || !/^[a-f0-9-]{36}$/.test(id))
    throw new Error("Invalid connection state.");
  return database.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.id, id),
          eq(paymentConnections.ownerId, ownerId),
          isNull(paymentConnections.disconnectedAt),
        ),
      )
      .for("update");
    if (
      !connection?.stateHash ||
      !connection.stateExpiresAt ||
      connection.stateExpiresAt.getTime() < Date.now() ||
      createHash("sha256").update(nonce).digest("hex") !== connection.stateHash
    )
      throw new Error("Connection state expired.");
    const [membership] = await tx
      .select()
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, connection.communityId),
          eq(communityMemberships.userId, ownerId),
          eq(communityMemberships.role, "owner"),
          eq(communityMemberships.status, "active"),
        ),
      );
    if (!membership) throw new Error("Community ownership changed.");
    const token = await exchangeStripeCode(code);
    if (connection.accountId && connection.accountId !== token.stripe_user_id)
      throw new Error(
        "Reconnect the original account to preserve payment history.",
      );
    const account = await stripeAccount(token.stripe_user_id);
    await tx
      .update(paymentConnections)
      .set({
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        environment: token.livemode ? "live" : "test",
        accountLabel: account.business_profile?.name ?? account.id,
        stateHash: null,
        stateExpiresAt: null,
      })
      .where(eq(paymentConnections.id, id));
    return connection.communityId;
  });
}

export async function selectConnection(
  database: typeof db,
  connection: PaymentConnection,
) {
  if (!connection.chargesEnabled || !connection.accountId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Complete payment setup first.",
    });
  await database.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${connection.communityId}, 0))`,
    );
    const [active] = await tx
      .select()
      .from(paymentSubscriptions)
      .where(
        and(
          eq(paymentSubscriptions.communityId, connection.communityId),
          ne(paymentSubscriptions.connectionId, connection.id),
          ne(paymentSubscriptions.status, "canceled"),
        ),
      )
      .limit(1);
    if (active)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Resolve existing subscriptions before changing provider.",
      });
    await tx
      .insert(paymentPolicies)
      .values({
        communityId: connection.communityId,
        activeConnectionId: connection.id,
      })
      .onConflictDoUpdate({
        target: paymentPolicies.communityId,
        set: { activeConnectionId: connection.id },
      });
  });
}
