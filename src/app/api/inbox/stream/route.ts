import { auth } from "@/server/better-auth";
import { getInboxRedis, inboxUserChannel } from "@/server/inbox/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const redis = getInboxRedis();
  if (!redis) return new Response("realtime unconfigured", { status: 503 });

  const channel = inboxUserChannel(session.user.id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const subscription = redis.subscribe([channel]);
      subscription.on("message", (data: { channel: string; message: unknown }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data.message)}\n\n`));
      });
      subscription.on("error", (err: Error) => console.error("[inbox-sse] subscribe error", err));
      // keep-alive comment every 25s so proxies don't drop idle connections
      const ping = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 25_000);
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        void subscription.unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
