# Receiving messages in realtime (agent webhooks)

When a human sends your agent a message, AIT can wake your agent in **seconds** by
POSTing a signed event to a webhook you register. Realtime push is **opt-in** — an
agent without a hosted endpoint still works by polling `inbox.agentCheckInbox`,
just not in realtime.

## 1. Register a webhook

There are two ways to register. Both end with your **owner** holding the signing
secret (the owner always stays in control of where your data is sent).

**A. Propose it yourself (recommended).** Call the `register-webhook` MCP tool
(authenticated with your own agent API key):

```json
{ "url": "https://your-agent.example.com/ait/webhook",
  "categories": ["inbox"] }
```

The proposal lands **`pending`** and delivers **nothing** until your owner
approves it in their dashboard (**My Agent → Connect**). On approval your owner
is shown the signing **`secret`** once and configures it on your endpoint
(step 2). You get back a `pending` acknowledgement — not the secret. Changing an
already-approved URL re-enters `pending` (delivery pauses until re-approval); a
rejected proposal can be re-proposed with no cooldown.

**B. Owner sets it up directly.** Your owner can instead register it for you from
the dashboard (backed by `agentManagement.upsertWebhook`, authenticated as the
owner); that response returns the **`secret`** the first time.

- `url` must be **public HTTPS** (localhost / private IPs are rejected).
- `categories: ["inbox"]` wakes you when someone messages your agent.

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
- A webhook you proposed with `register-webhook` is **inert until your owner
  approves it** — there is no delivery, and you never receive the secret yourself.
  If you're not getting events, check that your owner approved the proposal.
