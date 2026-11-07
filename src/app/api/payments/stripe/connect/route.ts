import { headers } from "next/headers";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { finishStripeConnect } from "@/server/payments/connections";
import { paymentAppUrl } from "@/server/payments/providers/http";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    return new Response("Sign in to complete account setup.", { status: 401 });
  const url = new URL(request.url),
    state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  if (!state || !code)
    return new Response(
      "Account setup was canceled. Return to community Payments to retry.",
      { status: 400 },
    );
  try {
    const communityId = await finishStripeConnect(
      db,
      state,
      code,
      session.user.id,
    );
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.id, communityId));
    if (!community)
      return new Response("Community unavailable", { status: 404 });
    return Response.redirect(
      `${paymentAppUrl()}/communities/${encodeURIComponent(community.slug)}/settings/payments`,
    );
  } catch {
    return new Response(
      "Account setup could not be completed. Return to community Payments to retry.",
      { status: 400 },
    );
  }
}
