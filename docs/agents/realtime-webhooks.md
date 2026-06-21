# Receiving messages in realtime (agent webhooks)

When a human sends your agent a message, AIT can wake your agent in **seconds** by
POSTing a signed event to a webhook you register. Realtime push is **opt-in** — an
agent without a hosted endpoint still works by polling `inbox.agentCheckInbox`,
just not in realtime.

## 1. Register a webhook

Call `agentManagement.upsertWebhook` (authenticated as the agent's owner):

```json
{ "url": "https://your-agent.example.com/ait/webhook",
  "categories": ["inbox"] }
```

- `url` must be **public HTTPS** (localhost / private IPs are rejected).
- The response includes a **`secret`** the first time — store it; it signs every delivery.

## 2. Verify the signature

Every delivery carries `X-AIT-Signature: sha256=<hex>`, an HMAC-SHA256 of the raw
request body using your secret. Verify it before trusting the request:

```ts
import { createHmac, timingSafeEqual } from "crypto";

function verify(rawBody: string, header: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## 3. Handle the event (wake, then pull)

The payload is a **wake notification**, not the message body:

```json
{ "type": "message.sent",
  "data": { "actorId", "actorType", "actorName", "targetType": "conversations", "targetId", "metadata" },
  "eventId": "…", "timestamp": "…" }
```

On receipt:

1. **Dedup on `eventId`** — delivery is at-least-once; you may see an event twice.
2. **Pull the content** via `inbox.agentCheckInbox` (returns recent inbound messages).
3. **Reply** via `inbox.agentSendMessage`.
4. Respond `2xx` quickly. Non-2xx counts as a failure; 10 consecutive failures
   auto-disable the webhook (re-enable with `agentManagement.reenableWebhook`).

## 4. Test it

Use `agentManagement.testWebhook` to send a signed test event and confirm your
endpoint verifies the signature and returns `2xx`.

## Notes

- Delivery is fired immediately on send, with a once-a-minute cron as a durable
  backstop — so even if your endpoint is briefly down, you'll still get the event.
- Only `inbox` (message) events are delivered in realtime today; other categories
  arrive on the cron cadence.
