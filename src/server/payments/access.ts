import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import {
  communityMemberships,
  paymentComplimentaryMembers,
  paymentOffers,
  paymentOrders,
  paymentPolicies,
  paymentSubscriptions,
} from "@/server/db/schema";
import { hasPaidAccess } from "@/lib/payments";

type Database = typeof db;
export type PaymentDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "execute"
>;

/** Explicit rollout switch; never enable before the additive migration is applied. */
export function paymentsEnabled() {
  return process.env.COMMUNITY_PAYMENTS_ENABLED === "true";
}

export async function membershipPaymentAllowed(
  database: PaymentDatabase,
  communityId: string,
  userId: string,
  now = new Date(),
): Promise<boolean> {
  if (!paymentsEnabled()) return true;
  const [policy] = await database
    .select()
    .from(paymentPolicies)
    .where(eq(paymentPolicies.communityId, communityId))
    .limit(1);
  if (!policy?.paidEntryAt) return true;
  const [complimentary] = await database
    .select()
    .from(paymentComplimentaryMembers)
    .where(
      and(
        eq(paymentComplimentaryMembers.communityId, communityId),
        eq(paymentComplimentaryMembers.userId, userId),
      ),
    )
    .limit(1);
  if (complimentary) return true;
  const subscriptions = await database
    .select({ subscription: paymentSubscriptions })
    .from(paymentSubscriptions)
    .innerJoin(
      paymentOrders,
      eq(paymentOrders.id, paymentSubscriptions.orderId),
    )
    .where(
      and(
        eq(paymentSubscriptions.communityId, communityId),
        eq(paymentSubscriptions.userId, userId),
        eq(paymentOrders.kind, "membership"),
      ),
    );
  return subscriptions.some(({ subscription }) =>
    hasPaidAccess(subscription, now),
  );
}

export async function requireMembershipPayment(
  database: PaymentDatabase,
  communityId: string,
  userId: string,
) {
  if (!(await membershipPaymentAllowed(database, communityId, userId)))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Choose a paid membership from the community offers page.",
    });
}

export async function coursePurchaseAllowed(
  database: PaymentDatabase,
  communityId: string,
  courseId: number,
  userId: string | null,
): Promise<boolean> {
  if (!paymentsEnabled()) return true;
  // Unpublishing stops new sales but must not turn purchased content into free content.
  const [offer] = await database
    .select({ id: paymentOffers.id })
    .from(paymentOffers)
    .where(
      and(
        eq(paymentOffers.communityId, communityId),
        eq(paymentOffers.kind, "course"),
        eq(paymentOffers.resourceId, courseId),
        isNotNull(paymentOffers.publishedAt),
      ),
    )
    .limit(1);
  if (!offer) return true;
  if (!userId) return false;
  const [purchase] = await database
    .select({ id: paymentOrders.id })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.communityId, communityId),
        eq(paymentOrders.buyerId, userId),
        eq(paymentOrders.kind, "course"),
        eq(paymentOrders.resourceId, courseId),
        inArray(paymentOrders.status, ["paid", "refund_pending"]),
        eq(paymentOrders.fulfillment, "fulfilled"),
      ),
    )
    .limit(1);
  return !!purchase;
}

export async function paymentMembership(
  database: PaymentDatabase,
  communityId: string,
  userId: string,
) {
  const [membership] = await database
    .select()
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userId, userId),
      ),
    )
    .limit(1);
  return membership ?? null;
}

export async function canReadPaidCommunity(
  database: PaymentDatabase,
  communityId: string,
  userId: string | null | undefined,
) {
  if (!paymentsEnabled()) return true;
  const [policy] = await database
    .select()
    .from(paymentPolicies)
    .where(eq(paymentPolicies.communityId, communityId))
    .limit(1);
  if (!policy?.paidEntryAt) return true;
  if (!userId) return false;
  const membership = await paymentMembership(database, communityId, userId);
  if (membership?.status !== "active") return false;
  return (
    membership.role !== "member" ||
    membershipPaymentAllowed(database, communityId, userId)
  );
}
