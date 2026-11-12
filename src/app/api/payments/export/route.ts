import { and, desc, eq, isNull } from "drizzle-orm";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  paymentOrders,
} from "@/server/db/schema";
import { paymentCsvCell } from "@/server/payments/format";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return new Response("Community required", { status: 400 });
  const [community] = await db
    .select({ id: communities.id })
    .from(communities)
    .innerJoin(
      communityMemberships,
      eq(communityMemberships.communityId, communities.id),
    )
    .where(
      and(
        eq(communities.slug, slug),
        isNull(communities.deletedAt),
        eq(communityMemberships.userId, session.user.id),
        eq(communityMemberships.role, "owner"),
        eq(communityMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!community) return new Response("Not found", { status: 404 });
  const orders = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.communityId, community.id))
    .orderBy(desc(paymentOrders.createdAt))
    .limit(10000);
  const rows: (string | number)[][] = [
    [
      "Order",
      "Date (UTC)",
      "Offer",
      "Kind",
      "Buyer email",
      "Amount in cents",
      "Currency",
      "Status",
      "AIT fee in cents",
    ],
    ...orders.map((order) => [
      order.id,
      order.createdAt.toISOString(),
      order.title,
      order.kind,
      order.buyerEmail,
      order.amount,
      order.currency,
      order.status,
      0,
    ]),
  ];
  return new Response(
    "\ufeff" +
      rows.map((row) => row.map(paymentCsvCell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="community-payments.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
