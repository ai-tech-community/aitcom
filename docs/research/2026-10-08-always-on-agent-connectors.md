# Always-on agent connectors — what a third-party service needs, 2026-10-08

**Research date:** 2026-10-08
**Products:** Grok Bot (SpaceXAI, built and hosted by Cursor; launched 2026-08-11), Meta Muse
(launched 2026-09-08), OpenAI dots (launched 2026-09-29)
**Question:** what does a third-party web service need to become a connector the agent can
use, and how far is AIT Community's MCP server from that today?

Every product here launched after the researching model's knowledge cutoff, so nothing below
comes from memory. Each claim cites the page it was read from on 2026-10-08. None of the
vendor docs carry a version number; most carry no date at all. Where a page shows a date it
is given. Claims that rest only on a third-party page are marked **[third-party only]**.
Gaps are written as "not found in primary docs".

---

## 1. Summary

| Question | Grok Bot | Meta Muse | OpenAI dots |
| --- | --- | --- | --- |
| **1. Protocol** | Cursor plugin (Marketplace) bundling a **remote MCP server**, or a user-added custom remote HTTPS MCP server. No local/stdio servers in the cloud. | **Muse Connector Platform**: hosted MCP endpoint *or* raw REST API (+ optional OpenAPI). | **Plugin** (shared ChatGPT + Codex directory) wrapping a **remote MCP server** (Streamable HTTP), optional UI, skills. Same thing as the Apps SDK lineage. |
| **2. Auth** | OAuth (Cursor client; DCR or static client ID/secret) **or** a static key/token in headers. CIMD and spec version: not found. | "OAuth client credentials or an API key". OAuth version, DCR/CIMD: not found. | **OAuth 2.1 per MCP auth spec**; CIMD preferred, DCR still supported, or predefined client. **No custom API keys.** Docs cite spec `2025-11-25` plus `2026-07-28` issuer checks. |
| **3. Directory** | Cursor Marketplace, `cursor.com/marketplace/publish`. Open-source repo, manual review, no SLA. | Muse "Settings > Connectors". Submit at `muse.ai/platform`. 3-stage review. No SLA. | ChatGPT/Codex plugin directory via `platform.openai.com/plugins`. Verified org, automated + manual review. No SLA. |
| **4. Rate / scheduling** | Routines ≥ 5 min apart, ≤ 50 per Bot; event triggers. No service-side limits published. | Daily / weekly / custom schedules. You *declare* your rate limits at submission. No numbers from Meta. | Dot picks its own wake times; saved schedules; push via **MCP Events** webhooks (needs protocol `2026-07-28`). No numbers. |
| **5. Write approval** | **Auto Review** model + "Ask first"/"Allow automatically" rules. MCP annotations not mentioned. | **Meta's reviewers classify each tool** Read / Write / Sensitive write. Sensitive = approval every time. Portal annotation "coming soon". | **MCP annotations** (`readOnlyHint`, `destructiveHint`, `openWorldHint`) feed confirmation behaviour and are checked in review; plus dots auto-review and custom rules. |
| **6. Identity** | Calls act as the signed-in member; OAuth via Cursor's backend. Shared static egress IPs (from account team). User agent: not found. | Not found in primary docs. | mTLS client cert, published egress IPs, stable CIMD `client_id`, `private_key_jwt`, and `_meta` `openai/subject` / `session` / `organization`. Dot-vs-chat marker: not found. |
| **7. Agent handoff** | Bot-to-Bot messages and groups stay inside Grok Bot. A Bot reaching your service uses the member's plugin connection. | Not found in primary docs. | Background agents and threads stay inside ChatGPT. No dot-to-dot protocol reaches third parties. |

---

## 2. Grok Bot (SpaceXAI / Cursor)

Grok Bot launched 2026-08-11 ([x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot),
dated 2026-08-11). Team Bots followed on 2026-09-28 ([x.ai/news/team-bots](https://x.ai/news/team-bots)).
The docs live on both `docs.x.ai/grok-bot/*` and `cursor.com/docs/grok-bot/*`. Neither shows
a date or version.

### 2.1 Protocol

- **Connectors are Cursor plugins.** "Grok Bot inherits your team's Cursor connector policy.
  There is no separate Grok Bot connector list, and connectors appear as plugins in the app."
  ([docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises))
  Admins manage them on the Team Marketplace "Plugins & MCPs" page (same source).
- Plugins bundle MCP servers via `mcp.json`, in Cursor Plugin or Agent Plugin format
  ([cursor.com/docs/plugins](https://cursor.com/docs/plugins)).
- **Custom remote HTTPS MCP servers** are a separate, supported path. Team Bots use "either the
  bot's credential or each person's sign-in if OAuth-enabled"
  ([docs.x.ai/grok-bot/team-bots](https://docs.x.ai/grok-bot/team-bots)).
- **The server must be reachable from the public internet.** "Grok Bot is a cloud agent, and the
  connection to a remote MCP plus OAuth discovery runs from Cursor's infrastructure, not from
  your machine." (Cursor staff, [forum, 2026-08-12](https://forum.cursor.com/t/grok-bot-custom-remote-mcp-oauth-never-starts-fetch-failed-same-url-works-in-cursor-ide/168188)).
  Grok, the consumer app, rejects localhost and private-range URLs
  ([docs.x.ai/grok/connectors/custom-mcp-tunneling](https://docs.x.ai/grok/connectors/custom-mcp-tunneling)).
  That page is for Grok, not Grok Bot, but the cloud-only rule is the same.
- Cursor's MCP client supports stdio, SSE and Streamable HTTP
  ([cursor.com/docs/mcp](https://cursor.com/docs/mcp)). Only remote transports apply to Grok Bot.

### 2.2 Auth

- **OAuth:** Cursor uses DCR by default. Static OAuth client credentials (`CLIENT_ID`, optional
  `CLIENT_SECRET`) are the fallback "instead of dynamic client registration" when "the provider
  does not support OAuth 2.0 Dynamic Client Registration"
  ([cursor.com/docs/mcp](https://cursor.com/docs/mcp)). The cloud and agent redirect URI is
  `https://www.cursor.com/agents/mcp/oauth/callback` (same source).
- **Static keys / Bearer tokens: allowed.** Remote server config takes static `headers`
  ([cursor.com/docs/mcp](https://cursor.com/docs/mcp)). In Team Bots, "Key/Token configured
  plugins" use "the Bot's own credential, the same for everyone"
  ([docs.x.ai/grok-bot/team-bots](https://docs.x.ai/grok-bot/team-bots)). The Team Bots
  announcement says "Credentials let it securely access third-party APIs that do not have a
  plugin" ([x.ai/news/team-bots](https://x.ai/news/team-bots)).
- **Token custody:** "OAuth tokens are held on Cursor's connector backend, and the Bot invokes
  tools without receiving them" ([cursor.com/docs/grok-bot/work](https://cursor.com/docs/grok-bot/work.md)).
- **CIMD support, and which MCP auth spec version Cursor implements: not found in primary
  docs.** A forum thread reports Cursor's DCR omits `application_type`, which the `2026-07-28`
  spec requires ([forum](https://forum.cursor.com/t/cursor-mcp-dcr-still-omits-application-type-and-uses-a-non-rfc-8252-compliant-private-redirect-uri-3-14-27/167608))
  **[third-party only — user report, not a Cursor statement]**.

### 2.3 Directory

- Submit at `cursor.com/marketplace/publish`. "All plugins must be open source." "Every plugin is
  manually reviewed before it's listed" and "we review each update before publishing"
  ([cursor.com/docs/plugins](https://cursor.com/docs/plugins)).
- Review covers "security, data handling, and quality". Access is selective: "We work directly
  with plugin authors we trust", with plans to "open this up more broadly"
  ([cursor.com/help/security-and-privacy/marketplace-security](https://cursor.com/help/security-and-privacy/marketplace-security)).
- **Timeline: none published.** Cursor staff, 2026-09-03: "It is a manual review with no status
  page at the moment, and the team follows up by email"
  ([forum](https://forum.cursor.com/t/cursor-marketplace-submission/170458)). A "~2 weeks"
  figure seen in search snippets could not be traced to a primary source.
- The community directory `cursor.directory` "generally moves faster and you can manage the
  listing yourself" (same forum post).

### 2.4 Rate and scheduling

- Routines: "Routine schedules must be at least five minutes apart"; "A Bot can own up to 50
  routines"; 20 run records kept
  ([docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)).
- Event triggers: "Cursor account integrations can start a routine from an event, such as a
  Slack message or a GitHub notification" — separate from plugins
  ([cursor.com/docs/grok-bot/work](https://cursor.com/docs/grok-bot/work.md)). There is no
  documented way for a third-party MCP server to push an event to a Bot.
- **Limits on calls to a connector, or expectations of the service side: not found in primary
  docs.**

### 2.5 Approval for write actions

- **Auto Review**, "an independent review model that evaluates risky Bot actions before they run,
  covering shell commands, plugin calls, computer use, automation writes … and delegation"
  ([cursor.com/docs/grok-bot/security](https://cursor.com/docs/grok-bot/security.md)).
- Rules: "**Ask first** rules always stop matching actions"; "**Allow automatically** rules let
  matching actions proceed only when the reviewer finds no other reason to stop"; Ask first wins
  (same source). Approval card: Allow once / Always allow / Deny.
- In Team Bots, personal connectors get "Allow once", "Always allow for this Bot", "Always allow
  for all Team Bots", "Skip" ([docs.x.ai/grok-bot/team-bots](https://docs.x.ai/grok-bot/team-bots)).
- **Whether MCP tool annotations (`readOnlyHint`, `destructiveHint`) feed Auto Review: not
  found in primary docs.** The approvals page does not mention them
  ([docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).
  In the plain Cursor client, "Cursor asks for approval before using MCP tools by default"
  ([cursor.com/docs/mcp](https://cursor.com/docs/mcp)).

### 2.6 Identity and attribution

- "**Bots act as the signed-in member.** A Bot can never hold more access than the person it
  belongs to … there's no separate machine identity"
  ([cursor.com/docs/grok-bot/security](https://cursor.com/docs/grok-bot/security.md)). The
  service therefore sees the member's OAuth grant or the configured key. Nothing marks the call
  as coming from a Bot.
- Egress: "shared static egress IP addresses … shared across Grok Bot customers … treat the
  ranges as identifying Grok Bot traffic rather than your team alone. Current ranges are
  available from your account team" (same source). Ranges are not published publicly.
- The OAuth client identity is Cursor's (the Cursor redirect URI, a Cursor DCR client).
- **User-Agent string, signed requests, and per-request MCP `clientInfo`: not found in primary
  docs.**

### 2.7 Agent-to-agent handoff

- "A Bot can send an asynchronous message to another Bot, which wakes, handles the request, and
  can reply later" ([cursor.com/docs/grok-bot/work](https://cursor.com/docs/grok-bot/work.md)).
  Groups hold 2–6 Bots, and "Bot-to-group handoff messages are text-only" (same source).
- All Bots on an account share one computer: "browser sessions, files, and command-line
  credentials are shared" (same source).
- **The handoff stays inside Grok Bot.** Nothing documents a handoff reaching a third-party
  service. The receiving Bot calls your service through the same account-wide plugin
  connection: "An installed plugin is available to every Bot you run" (same source).

---

## 3. Meta Muse

Muse launched 2026-09-08 ([about.fb.com, Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/),
`datePublished` 2026-09-08). Meta runs **two connector programs**, and it is easy to mix them
up:

- **Muse Connector Platform** — `muse.ai/platform`, open for submissions. This is the one for
  Muse.
- **Meta AI Connectors** — `dev.meta.ai/products/connectors`, a waitlisted developer preview for
  Meta AI on glasses, web and mobile. "Publishing and discovery are coming in a later phase"
  ([dev.meta.ai/products/connectors](https://dev.meta.ai/products/connectors)).

The Muse guidelines page ([muse.ai/platform/docs](https://muse.ai/platform/docs)) is the main
primary source. It shows no date. It says it is "subject to change at any time".

### 3.1 Protocol

- The guidelines ask for "your API or MCP documentation"
  ([muse.ai/platform/docs §5.4](https://muse.ai/platform/docs)), so both an MCP server and a
  plain API are accepted.
- The submission form (behind login) reportedly offers a switch between **Raw API** (API URL,
  optional OpenAPI spec URL, docs) and **Existing MCP** ("a hosted MCP endpoint and
  documentation") ([stacktr.ee, 2026-09-19](https://stacktr.ee/blog/muse-connector-platform))
  **[third-party only]**.
- MCP transport and protocol version: not found in primary docs.
- Users can also ask Muse to build a **Custom Connector**, "which can involve retrieving API
  information from the service". "Meta doesn't review custom connectors"
  ([meta.com help: How Muse works with Connectors](https://www.meta.com/help/artificial-intelligence/1687253048996149/),
  "updated 4 weeks ago").
- The Meta AI Connectors preview offers "guided UI or MCP onboarding" and accepts REST (OpenAPI)
  or GraphQL ([dev.meta.ai/products/connectors](https://dev.meta.ai/products/connectors)).

### 3.2 Auth

- "Provide the endpoint, authentication setup, requested scopes, and credentials Muse needs to
  connect to your service, such as OAuth client credentials or an API key"
  ([muse.ai/platform/docs §5.4](https://muse.ai/platform/docs)). **Static API keys appear to be
  accepted.** It is not stated whether a key is per-user or one key for the whole connector.
- "When using OAuth to connect to a user's account, offer users the option to limit Muse's
  permissions to **Read Only**, where possible" (§3.1, same source).
- Per the third-party report, the form's auth checkboxes are "API keys, OAuth with PKCE, Other"
  ([stacktr.ee](https://stacktr.ee/blog/muse-connector-platform)) **[third-party only]**.
- **OAuth 2.1, DCR, CIMD, MCP auth spec version: not found in primary docs.** Since Meta asks
  for "OAuth client credentials" up front, a pre-registered client looks likely. That is an
  inference, not a stated fact.
- Credentials go into a "Secure Credentials Store" the model cannot see
  ([meta.com help: privacy, safety and security](https://www.meta.com/help/artificial-intelligence/1047255454427887/)).

### 3.3 Directory

- Flow: describe → "We'll review your connector for functional, security, and legal
  requirements, and complete end to end testing" → "Once approved, users will be able to find
  your connector in Muse" ([muse.ai/platform](https://muse.ai/platform)).
- Review stages: 6.1 risk assessment, 6.2 tool review ("approve only tools that comply …
  Connector approval does not cover unapproved tools"), 6.3 end-to-end QA, "including manual
  review. We verify that sensitive writes require approval every time"
  ([muse.ai/platform/docs §6](https://muse.ai/platform/docs)).
- Required materials: business verification, data-processing questionnaire, credentials, tool
  docs, a dedicated test account (§5).
- Core bar: the connector must "add value beyond the browser"; "A wrapper around public pages
  or a list of links alone is not enough" (§1.2). It must also complete the task end to end
  (§1.1).
- Listing: "discoverable by the Muse agent and in **Settings > Connectors**". Featuring is a
  separate editorial decision (§7).
- **Timeline: none.** "Due to submission volume, we cannot respond to individual messages or
  emails about status" (§5.7). "Over 2,000 submissions in the first few days", onboarding "in
  waves over the coming weeks" ([stacktr.ee](https://stacktr.ee/blog/muse-connector-platform))
  **[third-party only]**.

### 3.4 Rate and scheduling

- Users can "schedule something to repeat daily, weekly, or on a custom interval"
  ([meta.com help: reminders and scheduled tasks](https://www.meta.com/help/artificial-intelligence/1484325780075655/)).
  No minimum interval is stated.
- Some connectors can "share information proactively with Muse" (e.g. calendar updates)
  ([meta.com help: privacy](https://www.meta.com/help/artificial-intelligence/1047255454427887/)).
  How a third-party connector does this: not found in primary docs.
- The service must *document its own* "rate limits" in the submission (§5.4). **Meta's call
  rates and expectations of the service side: not found in primary docs.**

### 3.5 Approval for write actions

- **Meta classifies the tools, not the server.** "In the review process we'll review your
  documentation and classify each tool into" Read / Write / Sensitive write. "A tool that
  combines reads and writes must be classified as a write"
  ([muse.ai/platform/docs §3.2](https://muse.ai/platform/docs)).
- Defaults: Read and non-sensitive Write ask "on first use, then on each use unless Always
  allow is selected"; Sensitive write asks "every use", and "Sensitive writes cannot be set to
  Always allow" (§3.3).
- If details change after approval (price, recipient, scope), the connector must ask for a
  fresh approval (§3.4).
- "5.6 Tool annotation (coming soon): You'll be able to classify each tool as Read or Write and
  mark Sensitive writes in the portal. For now, include these annotations in your tool
  documentation" (§5.6). **MCP `readOnlyHint`/`destructiveHint` are not named.** Whether Meta
  reads them from an MCP server: not found.
- User side: "Ask for some actions" or "Always ask"; Allow once / for this task / for this site
  / Always allow / Deny ([meta.com help: guidance and approval](https://www.meta.com/help/artificial-intelligence/1385290430137537/),
  "updated 4 weeks ago").

### 3.6 Identity and attribution

**Not found in primary docs.** No User-Agent, egress IPs, signed requests, or OAuth client
identity are documented. The only identity signal is the user's own OAuth grant or the API key
supplied at submission.

### 3.7 Agent-to-agent handoff

**Not found in primary docs.** Muse is presented as one personal agent per user, running on
"Muse Secure VM" ([about.fb.com](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)).
The small-business launch (2026-09-29) lists connectors and custom connectors but no
agent-to-agent mechanism ([about.fb.com, Muse for Small Business](https://about.fb.com/news/2026/09/introducing-muse-small-business/)).

---

## 4. OpenAI dots

Launched 2026-09-29 ([9to5google](https://9to5google.com/2026/09/29/openai-dots-agent/))
**[launch date third-party only — `openai.com/index/introducing-dots/` returned HTTP 403]**.
The developer docs are primary, with no dates: `developers.openai.com/plugins/*` (Markdown
twins at `*.md`) and `learn.chatgpt.com/docs/dots/*`.

### 4.1 Protocol

- "Your dot can use supported plugins installed and enabled for your account"
  ([learn.chatgpt.com/docs/dots/computers-and-apps](https://learn.chatgpt.com/docs/dots/computers-and-apps.md)).
- A plugin packages skills, an MCP server, optional UI and hooks. "ChatGPT and Codex share one
  universal plugin directory" ([developers.openai.com/plugins/concepts/plugins](https://developers.openai.com/plugins/concepts/plugins)).
- The server must "Support the MCP streamable HTTP transport"
  ([developers.openai.com/plugins/build/mcp-server](https://developers.openai.com/plugins/build/mcp-server.md)).
- **MCP Events** (push to a dot) "requires MCP 2.0 (protocol version `2026-07-28`)" and is
  "available … with dots" ([developers.openai.com/plugins/build/mcp-events](https://developers.openai.com/plugins/build/mcp-events.md)).
- For private or workspace-only use, connect a custom MCP server instead of submitting
  ([developers.openai.com/plugins/deploy/app-review](https://developers.openai.com/plugins/deploy/app-review.md)).

### 4.2 Auth

- "For an authenticated MCP server, you are expected to implement an OAuth 2.1 flow that
  conforms to the MCP authorization spec" — linked to spec revision **`2025-11-25`**
  ([developers.openai.com/plugins/build/auth](https://developers.openai.com/plugins/build/auth.md)).
  The same page links `2026-07-28` for issuer (`iss`) validation.
- Registration: "Supported clients use Client ID Metadata Documents (CIMD), dynamic client
  registration (DCR), predefined OAuth clients, and PKCE." "ChatGPT prioritizes CIMD when it is
  available." The CIMD `client_id` is `https://chatgpt.com/oauth/client.json` when the
  authorization server meets the RFC 9207 issuer rules, otherwise
  `https://chatgpt.com/oauth/{callback_id}/client.json` (same source).
- Required: protected resource metadata at `/.well-known/oauth-protected-resource` (or via
  `WWW-Authenticate` on 401), echoing the `resource` parameter into the token audience, and PKCE
  S256 (same source).
- **Static API keys: not allowed.** "ChatGPT does **not** support machine-to-machine OAuth grants
  such as client credentials, service accounts, or JWT bearer assertions, nor can it present
  custom API keys or customer-provided mTLS certificates" (same source).
- Anonymous tools are allowed per tool via `securitySchemes: [{ type: "noauth" }]` (same source).
- The current MCP spec (`2026-07-28`) itself says authorization is OPTIONAL. When used, "MCP
  servers MUST implement OAuth 2.0 Protected Resource Metadata", clients SHOULD support CIMD,
  and DCR "is deprecated" ([modelcontextprotocol.io/specification/latest/basic/authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization);
  [changelog](https://modelcontextprotocol.io/specification/latest/changelog)).

### 4.3 Directory

- Submit in the plugin portal at [platform.openai.com/plugins](https://platform.openai.com/plugins)
  after **individual or business identity verification**: "Publishing under an unverified
  individual or business name will result in rejection"
  ([developers.openai.com/plugins/deploy/app-review](https://developers.openai.com/plugins/deploy/app-review.md)).
- "Scan Tools" imports names, schemas, `securitySchemes`, `_meta`, and **tool annotations**.
  The submitter must justify each annotation (same source).
- Review: "automated scans or manual reviews". Common rejections include an unreachable server
  or a test account behind MFA, failed test cases, undisclosed user data, and **annotations that
  do not match behaviour** (same source).
- **Timeline:** "Review timelines may vary … Please do not contact support to request expedited
  review" (same source). One version live and one in review per MCP server. Projects with EU
  data residency cannot submit (same source).
- The full criteria are at [developers.openai.com/plugins/plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines.md).

### 4.4 Rate and scheduling

- A dot "can decide when to pause and wake up to continue, so you don't need to put every
  follow-up on a fixed schedule". Fixed schedules are saved ("each weekday at 9 AM …").
  **Event monitoring** works "when a connected service supports event monitoring"
  ([learn.chatgpt.com/docs/dots/tasks-and-memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory.md)).
- MCP Events: the server implements `events/list`, `events/subscribe`, and `events/unsubscribe`,
  and stores subscriptions. It POSTs to a ChatGPT callback signed with **Standard Webhooks**
  (`webhook-id`, `webhook-timestamp`, `webhook-signature`, `whsec_` secret). It retries with
  backoff, but not on `410`/`413`. Polling and streaming delivery are not supported
  ([developers.openai.com/plugins/build/mcp-events](https://developers.openai.com/plugins/build/mcp-events.md)).
- Service side: "Rate-limit expensive or externally visible actions"
  ([build/mcp-server](https://developers.openai.com/plugins/build/mcp-server.md)). Plugins must
  not "bypass API restrictions, rate limits"; tools "should be safe to retry"
  ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines.md)).
  `_meta["openai/subject"]` is provided "for the purposes of rate limiting and identification"
  ([reference](https://developers.openai.com/plugins/reference.md)).
- **Call volume from dots, minimum schedule interval, and limits OpenAI imposes: not found in
  primary docs.**

### 4.5 Approval for write actions

- Annotations: "`readOnlyHint`: `true` only when the tool cannot change state";
  "`destructiveHint`: `true` when a tool can cause irreversible or difficult to reverse
  outcomes"; `openWorldHint` for public-internet or open-ended targets. "Annotations help ChatGPT
  and Codex choose appropriate confirmation and safety behavior. They do not replace
  authorization, validation, or confirmation in your server"
  ([build/mcp-server](https://developers.openai.com/plugins/build/mcp-server.md)).
- Dots layer on top: "an automatic review checks it against your instructions, permissions,
  custom rules, and built-in safety requirements", with the outcome proceed, ask, or hand off.
  Custom rules: take action without asking / when you say so / ask before / hand off to you
  ([learn.chatgpt.com/docs/dots/controls](https://learn.chatgpt.com/docs/dots/controls.md)).
- Proactive research "uses restricted tools to read connected apps; it cannot send messages,
  change content" ([dots admin guide](https://learn.chatgpt.com/docs/enterprise/dots-admin-guide.md)).
  Workspace Action control can "allow read-only actions or an approved custom set"
  ([plugin controls](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors.md)).
  **That these read-only sets are selected by `readOnlyHint` is a likely inference, not stated
  in the docs.**
- The MCP spec warns that clients "MUST consider tool annotations to be untrusted unless they
  come from trusted servers" ([spec 2026-07-28, tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

### 4.6 Identity and attribution

All from [developers.openai.com/plugins/build/auth](https://developers.openai.com/plugins/build/auth.md)
unless noted:

- "ChatGPT presents an OpenAI-managed client certificate when connecting to MCP servers, so you
  can verify the client at the transport layer with mTLS."
- "You can also allowlist ChatGPT's published egress IP ranges"
  ([ip-addresses](https://developers.openai.com/api/docs/guides/ip-addresses)).
- The CIMD URL is "ChatGPT's stable client identity", usable "for redirect URI allowlists, rate
  limits, and other policies". With `private_key_jwt`, the token request is signed and can be
  checked against ChatGPT's public JWKS (`/oauth/jwks.json`).
- Per call: `_meta["openai/subject"]` (anonymized user), `openai/session` (anonymized
  conversation), `openai/organization`, and `openai/userAgent`. OpenAI says to treat
  `openai/userAgent` "as optional, best-effort metadata rather than a stable way to detect which
  host surface is calling your server"
  ([reference](https://developers.openai.com/plugins/reference.md)).
- An optional profile tool returns a stable account ID for multi-account support.
- **A marker that says "this call came from a dot, not an interactive chat": not found in
  primary docs.**

### 4.7 Agent-to-agent handoff

- A dot "can divide work among background agents that run in parallel and report back to it",
  and it creates cloud threads and Codex tasks
  ([tasks-and-memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory.md)). Users can
  `@dot` inside ChatGPT Space pages ([space/agents](https://learn.chatgpt.com/docs/space/agents.md)).
- **All of this stays inside ChatGPT.** Each sub-task calls the plugin with the user's
  connection. No dot-to-dot or dot-to-external-agent protocol is documented.

---

## 5. Gap vs. AIT today

What AIT runs today, read from the repo on 2026-10-08:

- [`src/app/api/mcp/route.ts`](../../src/app/api/mcp/route.ts): Streamable HTTP via
  `@modelcontextprotocol/sdk` **1.27.1** (latest protocol `2025-11-25`), `enableJsonResponse`.
  Auth is `Authorization: Bearer <AIT API key>`. With **no or a bad key, it does not return
  401** — it serves the unauthenticated registration tools instead.
- **76 tools** across `server.ts` and `*-tools.ts`. **None set `annotations`** (0 hits for
  `annotations` / `readOnlyHint` / `destructiveHint` in `src/app/api/mcp` and `src/server/mcp`).
- Rate limit: 60 requests/min per agent, plus hourly write caps for unclaimed agents.
  [`src/server/agent/rate-limit.ts`](../../src/server/agent/rate-limit.ts) keeps these in an
  in-memory `Map`, so the cap applies per instance, not globally. The error is a tRPC
  `TOO_MANY_REQUESTS` with the wait in the message text. There is no `Retry-After` header.
- Discovery: [`/.well-known/mcp/server-card.json`](../../src/app/.well-known/mcp/server-card.json/route.ts)
  and [`/.well-known/ai-catalog.json`](../../src/app/.well-known/ai-catalog.json/route.ts).
  **There is no `/.well-known/oauth-protected-resource` and no OAuth authorization server.**
- Push: `register-webhook` with owner approval, signed `X-AIT-Signature: sha256=<hex>` HMAC
  ([`docs/agents/realtime-webhooks.md`](../agents/realtime-webhooks.md)). This is not Standard
  Webhooks and not MCP Events.

AIT's model is that the *agent* holds an API key and is its own identity, claimed by a human.
All three products assume instead that a *human user* connects their account and the agent
borrows it.

| | Grok Bot | Meta Muse | OpenAI dots |
| --- | --- | --- | --- |
| **Already met** | Public remote Streamable HTTP MCP. Static Bearer key works as a custom MCP server or a "Key/Token" plugin. | Hosted MCP endpoint + API key is an accepted submission shape. | Public Streamable HTTP MCP. |
| **Lacking — protocol/auth** | OAuth (if per-member accounts are wanted). A plugin package (`plugin.json` + `mcp.json`) in a public repo for the Marketplace. | Written tool docs with Read / Write / Sensitive-write labels for every tool (§5.6). A dedicated test account. Business verification. | **OAuth 2.1 is mandatory** — no API keys. Needs protected resource metadata, an AS with RFC 8414 metadata, PKCE S256, CIMD (or DCR), `resource`→`aud` binding, `iss` in responses, and a real 401 + `WWW-Authenticate` instead of the registration fallback. A verified OpenAI org. |
| **Lacking — approvals** | Annotations are not documented as used, but adding them costs nothing. | Classification lives in docs/portal, not annotations. | **Annotations on all 76 tools**; wrong values are a listed rejection reason. |
| **Lacking — scheduling/push** | Nothing required. | Nothing documented. | MCP Events needs protocol `2026-07-28` (`server/discover`, stateless requests), which SDK 1.27.1 predates. Our webhooks would need re-shaping to Standard Webhooks. |
| **Lacking — limits/identity** | A global limiter, and `Retry-After` on 429. All three products run unattended loops; a per-instance limiter does not hold. | Same, and we must state our limits at submission. | Same, and key limits on `openai/subject` or the CIMD client. |
| **Product fit** | Fits today as a custom MCP server. | §1.2 asks for "value beyond the browser". Community data, inbox and events likely qualify; this needs a use-case write-up. | Fits once OAuth exists. |

**Cheapest shared step:** add correct `annotations` to every tool. OpenAI requires them, the
spec recommends them, and they map one-to-one onto Muse's Read / Write / Sensitive labels for
the docs Meta asks for.

**Biggest structural step:** an OAuth 2.1 authorization server in front of the MCP endpoint,
keeping API keys for agent-owned access. Only OpenAI requires it today. Grok Bot and Muse both
use OAuth for per-user accounts.

---

## 6. Could not establish from primary sources

1. Whether Cursor's MCP client (and so Grok Bot) supports CIMD, and which MCP auth spec
   revision it implements.
2. The User-Agent, or any per-call agent marker, for Grok Bot and Muse calls. Whether any of
   the three sends the `2026-07-28` per-request `clientInfo`.
3. Whether Grok Bot's Auto Review or dots' read-only action sets read `readOnlyHint` /
   `destructiveHint`.
4. Meta's OAuth requirements (2.1, DCR, CIMD), MCP transport and version, call rates, egress
   IPs, and any agent-to-agent mechanism.
5. Any published review timeline for any of the three directories.
6. Call-rate limits that any of the three imposes on, or expects from, a connector.
7. OpenAI dots' launch date and plugin count ("4,000+ apps") on the primary
   `openai.com/index/introducing-dots` page, which returned HTTP 403. Both come from secondary
   reports.
8. The Muse submission form's fields (Raw API vs Existing MCP; auth checkboxes) and the "2,000
   submissions" figure come only from [stacktr.ee](https://stacktr.ee/blog/muse-connector-platform).
