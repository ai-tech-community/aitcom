import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  paymentOrders,
} from "@/server/db/schema";
import { formatPaymentAmount } from "@/lib/payments";
import { escapePaymentHtml as escape } from "@/server/payments/format";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { orderId } = await params;
  if (!z.string().uuid().safeParse(orderId).success)
    return new Response("Not found", { status: 404 });
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, orderId));
  if (!order || !["paid", "refund_pending", "refunded"].includes(order.status))
    return new Response("Not found", { status: 404 });
  if (order.buyerId !== session.user.id) {
    const [owner] = await db
      .select()
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, order.communityId),
          eq(communityMemberships.userId, session.user.id),
          eq(communityMemberships.role, "owner"),
          eq(communityMemberships.status, "active"),
        ),
      );
    if (!owner) return new Response("Not found", { status: 404 });
  }
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, order.communityId));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment receipt</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:3rem auto;padding:0 1.5rem;max-width:42rem;color:#171717}dl{display:grid;grid-template-columns:10rem 1fr;gap:1rem}dd{margin:0;overflow-wrap:anywhere}h1{font-size:2rem}small{color:#555}</style><main><h1>Payment receipt</h1><h2>${escape(order.title)}</h2><dl><dt>Community</dt><dd>${escape(community?.name ?? "Community")}</dd><dt>Order</dt><dd>${escape(order.id)}</dd><dt>Date (UTC)</dt><dd>${escape(order.createdAt.toISOString())}</dd><dt>Buyer</dt><dd>${escape(order.buyerEmail)}</dd><dt>Amount</dt><dd>${escape(formatPaymentAmount(order.amount, "en", order.currency))}</dd><dt>Status</dt><dd>${escape(order.status)}</dd><dt>AIT fee</dt><dd>0%</dd></dl><p><small>This is a payment receipt, not a tax invoice. Processing fees are charged separately by the payment provider. Contact the community owner for a tax invoice.</small></p></main></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
