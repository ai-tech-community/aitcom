import { and, eq } from "drizzle-orm";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { messages, conversationParticipants } from "@/server/db/schema";
import { cspForResource } from "@/lib/chat/trust";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const id = new URL(request.url).searchParams.get("messageId");
  if (!id) return new Response("missing messageId", { status: 400 });

  const [m] = await db
    .select({ conversationId: messages.conversationId, uiResource: messages.uiResource, trust: messages.uiProducerTrust })
    .from(messages).where(eq(messages.id, id)).limit(1);
  if (!m?.uiResource) return new Response("not found", { status: 404 });

  const [member] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, m.conversationId), eq(conversationParticipants.userId, session.user.id)))
    .limit(1);
  if (!member) return new Response("forbidden", { status: 403 });

  return new Response(m.uiResource.content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": cspForResource(m.trust ?? "member", m.uiResource.csp),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
