# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete
- **Scope:** SQLi, Command Injection, LFI/RFI, SSTI, Path Traversal, Deserialization — externally exploitable via `https://www.aitcommunity.org`
- **Key Outcome:** Five high-confidence **SQL LIKE-pattern injection** vulnerabilities were identified across public and authenticated tRPC procedures, plus one medium-confidence path traversal in the file upload endpoint. **No classic SQL injection, command injection, SSTI, or insecure deserialization** vulnerabilities were found. All exploitable findings have been passed to the exploitation phase via `deliverables/injection_exploitation_queue.json`.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and environmental intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

### Finding Summary

| ID | Type | Endpoint | Auth Required | Confidence | Verdict |
|----|------|----------|--------------|------------|---------|
| INJ-VULN-01 | SQLi (LIKE) | `members.listMembers` | None | HIGH | VULNERABLE |
| INJ-VULN-02 | SQLi (LIKE) | `forum.getThreads` | None | HIGH | VULNERABLE |
| INJ-VULN-03 | SQLi (LIKE) | `launchpad.list` | None | HIGH | VULNERABLE |
| INJ-VULN-04 | SQLi (LIKE) | `agent.browseMembers` | Agent API key | HIGH | VULNERABLE |
| INJ-VULN-05 | SQLi (LIKE) | `inbox.searchMembers` | User session | HIGH | VULNERABLE |
| INJ-VULN-06 | PathTraversal | `POST /api/upload` | User session | MEDIUM | VULNERABLE |

---

## 2. Dominant Vulnerability Patterns

### Pattern A — Unescaped `ilike()` Template Literals (Drizzle ORM)

- **Description:** In multiple tRPC routers, `input.search` is string-interpolated directly into a Drizzle ORM `ilike()` call without passing it through the `escapeLike()` function that already exists in the codebase. The pattern is: `` ilike(field, `%${input.search}%`) ``. Because `%` and `_` are SQL LIKE metacharacters, an attacker can craft patterns that match unintended rows.
- **Implication:** An unauthenticated (or lightly authenticated) attacker can bypass search intent, enumerate all records with `%`, probe character-by-character with `_`, and perform blind LIKE-based data discovery. All affected procedures have the `escapeLike()` fix available in the same codebase but not applied.
- **Representative:** INJ-VULN-01 (`members.listMembers`), INJ-VULN-04 (`agent.browseMembers`)

### Pattern B — PayloadCMS `like` Operator Without LIKE-Metacharacter Escaping

- **Description:** tRPC procedures that delegate search to PayloadCMS pass `input.search` directly as `{ title: { like: input.search } }`. PayloadCMS translates this to a PostgreSQL LIKE/ILIKE and parameterizes the value (preventing full SQL injection), but does not escape LIKE wildcards (`%`, `_`, `\`) within the pattern string. An attacker controls the full LIKE pattern argument.
- **Implication:** Same wildcard-injection impact as Pattern A. The PayloadCMS REST API also exposes this operator directly at `/api/{collection}?where[field][like]=value` for collections that permit unauthenticated reads.
- **Representative:** INJ-VULN-02 (`forum.getThreads`), INJ-VULN-03 (`launchpad.list`)

### Pattern C — Incomplete LIKE Escaping (Backslash Bypass)

- **Description:** `inbox.searchMembers` attempts to escape LIKE wildcards but uses a flawed sequential approach: it escapes `%` → `\%` and `_` → `\_` without first escaping the backslash character itself. An attacker who submits input containing a literal backslash (e.g., `\%`) defeats the escaping: the `%` remains a wildcard in the generated pattern. Contrast with the correct `escapeLike()` in `communities.ts:23-24`: `str.replace(/[%_\\]/g, "\\$&")` — which escapes all three characters atomically.
- **Implication:** An authenticated attacker can use `\%` or `\_` inputs to inject LIKE wildcards through an endpoint that falsely appears to be protected by escaping.
- **Representative:** INJ-VULN-05 (`inbox.searchMembers`)

### Pattern D — `escapeLike()` Correctly Applied (Safe Reference Pattern)

- **Description:** `communities.list` (`communities.ts:57`) and `agent-communities.browseCommunities` (`agent-communities.ts:111`) both define and use an `escapeLike()` helper that correctly escapes all three LIKE metacharacters before interpolation.
- **Implication:** These procedures are safe. The fix for all vulnerable procedures is to import and apply the same `escapeLike()` pattern.
- **Representative:** communities.ts (SAFE baseline)

---

## 3. Strategic Intelligence for Exploitation

### 3.1 Defensive Evasion (WAF Analysis)

- **No WAF Evidence:** No Web Application Firewall was identified in the recon report or code analysis. Requests flow through Vercel Edge Network (CDN/TLS termination only). No application-level firewall rules are configured.
- **Zod Input Validation:** The vulnerable `search`/`query` fields only enforce `z.string().optional()`, `z.string().max(200).optional()`, or `z.string().min(1).max(100)`. None restrict the metacharacters `%`, `_`, or `\`. Zod will not block any LIKE injection payload.
- **Recommendation:** No evasion required. Payloads should be submitted directly.

### 3.2 Nature of the Injection (Critical Context for Exploitation)

These are **LIKE-metacharacter injection** vulnerabilities, NOT full SQL injection. Injected characters affect pattern matching within an already-parameterized query. Classic UNION, stacked queries, or out-of-band exfiltration are NOT possible via these vectors. Practical exploitation impacts:

- **Wildcard Enumeration (`%`):** Force search to return all records, bypassing content filtering and exposing the full dataset with a single request.
- **Character-Position Probing (`_`):** Use `_` wildcards to locate records matching precise character patterns (e.g., `_dmin%` finds names where 2nd-5th chars are "dmin").
- **Denial of Service:** Complex patterns like `%_%_%_%_%` force expensive full-table scans on production PostgreSQL.
- **Blind Pattern Discovery:** By varying patterns and observing result-count changes, enumerate content not otherwise accessible.

### 3.3 Confirmed Database Technology

- **Database:** Neon Serverless PostgreSQL (dual schema: `public` for PayloadCMS, `app` for Drizzle ORM)
- **LIKE Operator in Use:** PostgreSQL `ILIKE` (case-insensitive). Metacharacters: `%` (any sequence), `_` (any single character).
- **ORM Layer:** Drizzle ORM v0.41 (type-safe SQL builder with parameterized bindings), PayloadCMS v3 (document query builder translating to PostgreSQL LIKE).

### 3.4 Email Address Exposure Amplification

- `members.listMembers` (INJ-VULN-01) returns **email addresses** for all matched members. LIKE injection with `%` as the search term returns **all member emails** in a single unauthenticated request, amplifying the existing email enumeration vulnerability noted in the recon.

### 3.5 Unauthenticated vs. Authenticated Surfaces

| Vulnerability | Auth Requirement | Exploitation Path |
|--------------|-----------------|-------------------|
| INJ-VULN-01 | None | Direct HTTP request |
| INJ-VULN-02 | None | Direct HTTP request |
| INJ-VULN-03 | None | Direct HTTP request |
| INJ-VULN-04 | Agent API key (read scope) | Register → create agent → generate key → use as Bearer |
| INJ-VULN-05 | User session | Register → log in → use session cookie |
| INJ-VULN-06 | User session | Register → log in → upload file |

---

## 4. Detailed Source-to-Sink Traces

### INJ-VULN-01: `members.listMembers` — Unescaped `ilike()` (Unauthenticated)

- **Source:** `input.search` — `z.string().optional()` (no length limit, no character restrictions). `src/server/api/routers/members.ts:174`
- **Endpoint:** `GET /api/trpc/members.listMembers?input={"json":{"search":"..."}}`
- **Flow:**
  1. `input.search` received at tRPC publicProcedure (no auth)
  2. `members.ts:188` — `ilike(memberProfiles.displayName, \`%${input.search}%\`)`
  3. `members.ts:189` — `ilike(memberProfiles.company, \`%${input.search}%\`)`
  4. Drizzle `.where(and(...conditions))` builds parameterized query → PostgreSQL ILIKE
- **Sink:** `src/server/api/routers/members.ts:188-189` — `ilike(field, pattern)` where pattern contains raw user input
- **Sanitization Observed:** None
- **Concat Occurrences:** Template literal at `members.ts:188-189` (no prior sanitization to flag)
- **Slot Type:** SQL-like
- **Verdict:** Vulnerable
- **Mismatch Reason:** Direct string interpolation of `input.search` into LIKE pattern; `%` and `_` in user input act as SQL wildcards. The `escapeLike()` helper at `communities.ts:23-24` corrects this but is not imported or used here.
- **Witness Payload:** `%` (returns all members + emails), `a_min%` (finds names matching "a_min..." pattern)
- **Confidence:** HIGH — code confirms no escaping, direct template literal, confirmed by code inspection

### INJ-VULN-02: `forum.getThreads` — PayloadCMS `like` Operator (Unauthenticated)

- **Source:** `input.search` — `z.string().max(200).optional()`. `src/server/api/routers/forum.ts:340`
- **Endpoint:** `GET /api/trpc/forum.getThreads?input={"json":{"communitySlug":"...","search":"..."}}`
- **Flow:**
  1. `input.search` received at tRPC publicProcedure
  2. `forum.ts:368-372` — `conditions.push({ or: [{ title: { like: input.search } }] })`
  3. `forum.ts:384` — `payload.find({ collection: "forum-threads", where })` → PayloadCMS → PostgreSQL LIKE
- **Sink:** `src/server/api/routers/forum.ts:370` — PayloadCMS `like` operator with raw user value
- **Sanitization Observed:** None
- **Slot Type:** SQL-like
- **Verdict:** Vulnerable
- **Mismatch Reason:** `input.search` passed directly as PayloadCMS `like` value; PayloadCMS parameterizes the value but does not escape LIKE metacharacters within the pattern string.
- **Witness Payload:** `%` (returns all threads), `_nnounc%` (threads containing any-char + "nnounc" in title)
- **Confidence:** HIGH

### INJ-VULN-03: `launchpad.list` — PayloadCMS `like` Operator, Two Fields (Unauthenticated)

- **Source:** `input.search` — `z.string().max(200).optional()`. `src/server/api/routers/launchpad.ts:70`
- **Endpoint:** `GET /api/trpc/launchpad.list?input={"json":{"search":"..."}}`
- **Flow:**
  1. `input.search` received at tRPC publicProcedure
  2. `launchpad.ts:90-96` — `conditions.push({ or: [{ title: { like: input.search } }, { "tags.tag": { like: input.search } }] })`
  3. `launchpad.ts:105` — `payload.find({ collection: "launchpad-projects", where })` → PostgreSQL LIKE on both `title` and nested `tags[].tag`
- **Sink:** `src/server/api/routers/launchpad.ts:93-94` — PayloadCMS `like` on two fields
- **Sanitization Observed:** None
- **Concat Occurrences:** None (no concat in application code; PayloadCMS builds the SQL internally)
- **Slot Type:** SQL-like (two fields: `title` and `tags.tag`)
- **Verdict:** Vulnerable
- **Mismatch Reason:** Same as INJ-VULN-02; additionally injects into nested array field `tags.tag`.
- **Witness Payload:** `%` (returns all projects), `a_` (finds title/tag with "a" + any single char)
- **Confidence:** HIGH

### INJ-VULN-04: `agent.browseMembers` — Unescaped `ilike()` (Agent API Key)

- **Source:** `input.search` — `z.string().optional()` (no length limit). `src/server/api/routers/agent.ts:271`
- **Endpoint:** `GET /api/trpc/agent.browseMembers` (also exposed via MCP at `/api/mcp`)
- **Auth:** Bearer agent API key with `read` scope; obtainable by registering and calling `agentManagement.createAgent` + `agentManagement.generateKey`
- **Flow:**
  1. Agent API key validated; `requireScope(ctx.agent.scopes, "read")` at `agent.ts:275`
  2. `agent.ts:317-321` — `if (input.search) { conditions.push(ilike(memberProfiles.displayName, \`%${input.search}%\`)) }`
  3. Drizzle query → PostgreSQL ILIKE
- **Sink:** `src/server/api/routers/agent.ts:319` — `ilike(field, pattern)` with raw interpolation
- **Sanitization Observed:** None
- **Slot Type:** SQL-like
- **Verdict:** Vulnerable
- **Mismatch Reason:** Identical to INJ-VULN-01; `escapeLike()` not imported or used.
- **Witness Payload:** `%` (returns all members), `_%` (all members with name ≥1 char)
- **Confidence:** HIGH

### INJ-VULN-05: `inbox.searchMembers` — Backslash Escape Bypass (Authenticated)

- **Source:** `input.query` — `z.string().min(1).max(100)`. `src/server/api/routers/inbox.ts:457`
- **Endpoint:** `GET /api/trpc/inbox.searchMembers` (requires valid user session cookie)
- **Flow:**
  1. `protectedProcedure` validates session
  2. `inbox.ts:465` — `const escaped = input.query.replace(/%/g, "\\%").replace(/_/g, "\\_");`
  3. `inbox.ts:466` — `const pattern = \`%${escaped}%\`;`
  4. `inbox.ts:481-482` — `ilike(memberProfiles.displayName, pattern)` + `ilike(user.name, pattern)` → PostgreSQL ILIKE
- **Sink:** `src/server/api/routers/inbox.ts:481-482`
- **Sanitization Observed:** Partial escape at `inbox.ts:465` — `%`→`\%`, `_`→`\_`; **backslash itself NOT escaped**
- **Concat After Sanitization:** Template literal at `inbox.ts:466` — after incomplete sanitization (sanitization is ineffective for backslash inputs)
- **Slot Type:** SQL-like
- **Verdict:** Vulnerable
- **Mismatch Reason:** Escaping `%` and `_` without first escaping `\` allows backslash-prefixed inputs to bypass protection. Input `\%` produces escaped value `\\%`; in the LIKE pattern `%\\%%`, the trailing `%` is still a wildcard. Correct fix: `communities.ts:23-24` uses `str.replace(/[%_\\]/g, "\\$&")` — single-pass regex escaping all three metacharacters atomically.
- **Witness Payload:** `\%` (defeats escaping — `%` acts as wildcard), `\_` (defeats underscore escaping)
- **Confidence:** HIGH — code explicitly shows the missing `\` escape step

---

## 5. Vectors Analyzed and Confirmed Secure

These input vectors were traced and confirmed to have robust, context-appropriate defenses. They are **low-priority** for further testing.

| **Source (Parameter/Key)** | **Endpoint / File Location** | **Defense Mechanism Implemented** | **Verdict** |
|-----------------------------|------------------------------|-----------------------------------|-------------|
| `input.search` (community list) | `communities.list` / `communities.ts:57` | `escapeLike()` applied before `ilike()`: escapes `%`, `_`, `\` correctly | SAFE |
| `input.search` (agent community browse) | `agent-communities.browseCommunities` / `agent-communities.ts:111` | `escapeLike()` applied before `ilike()` | SAFE |
| `paymentId` | `POST /api/mollie/webhook` / `mollie/webhook/route.ts:39` | Drizzle `eq(field, paymentId)` — parameterized binding, no string concat | SAFE (SQLi) |
| All Drizzle ORM `eq()` / `ne()` / `and()` value comparisons | All tRPC routers | Drizzle ORM parameterized binding for all exact-match / comparison slots | SAFE |
| `userId`, `communitySlug`, `threadId`, `postId`, `eventId` | All tRPC routers | UUID / integer type coercion or exact-match Drizzle binding | SAFE |
| `role` field in `communities.setMemberRole` | `communities.ts` | Zod `z.enum(["member","moderator","admin"])` — strict whitelist | SAFE |
| Template engine / SSTI surface | No template engine used | Next.js JSX compiled at build time; no Handlebars/EJS/Pebble at runtime | SAFE (SSTI n/a) |
| Shell commands / command injection surface | No `exec`/`spawn` found | No shell invocations in any network-accessible code path | SAFE (CMDi n/a) |
| Deserialization surface | `JSON.parse` + Zod only | No `pickle.loads`, `unserialize`, `readObject`, or unsafe deserializers used | SAFE (Deserialize n/a) |
| `input.query` (`%` and `_` characters only) | `inbox.searchMembers` / `inbox.ts:465` | `%`→`\%` and `_`→`\_` escaping present — partially effective | PARTIALLY SAFE (backslash bypass remains — see INJ-VULN-05) |

---

## 6. File Upload Path Traversal (Medium Confidence)

- **Source:** `file.name` (multipart form, client-controlled filename) and `file.type` (client-controlled MIME type). `src/app/api/upload/route.ts:12-13`
- **Endpoint:** `POST /api/upload` (requires valid user session)
- **Flow:**
  1. `upload/route.ts:19` — MIME check: `file.type.startsWith("image/")` — client-supplied Content-Type only, no magic-byte verification
  2. `upload/route.ts:37` — `file.name` passed directly: `payload.create({ collection: "media", file: { name: file.name, mimetype: file.type } })`
  3. PayloadCMS S3 storage plugin uses `filename` in `generateFileURL` (`payload.config.ts`) to build the S3 object key and public URL
- **Sink:** S3 object key derived from unsanitized `file.name`
- **Sanitization Observed:** None on `file.name`; `file.type` check is `startsWith("image/")` only (trivially bypassed by setting `Content-Type: image/svg+xml`)
- **Slot Type:** FILE-path
- **Verdict:** Vulnerable (medium confidence)
- **Mismatch Reason:**
  1. **MIME Bypass (most impactful):** `image/svg+xml` passes the `startsWith("image/")` check. SVG files containing `<script>` tags can be uploaded, stored at a public S3 URL, and execute JavaScript in browsers that load the SVG directly. `dangerouslyAllowSVG: true` is configured in `next.config.js`.
  2. **S3 Key Injection:** `file.name` with path separators (`../`, absolute paths) is passed unsanitized. While AWS S3 does not perform filesystem path traversal (keys are flat), crafted filenames may produce unexpected S3 key patterns or collide with existing objects.
- **Confidence:** MEDIUM — S3 true filesystem traversal is not possible; SVG XSS impact requires browser to load S3 URL directly (not inline in the app); PayloadCMS may sanitize filenames internally (not fully verified)
- **Witness Payload (Path Traversal):** Filename `../../../../etc/passwd` or `../media/admin-config.json`
- **Witness Payload (MIME Bypass):** SVG file with content `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>`, uploaded with `Content-Type: image/svg+xml`

---

## 7. Analysis Constraints and Blind Spots

### 7.1 PayloadCMS `like` Operator Wildcard-Wrapping Behavior
PayloadCMS v3 translates `{ field: { like: value } }` to PostgreSQL LIKE/ILIKE. Whether PayloadCMS adds `%` wildcards around the user value (making it a `contains` search) or passes it verbatim was inferred from code analysis and documentation. If PayloadCMS adds surrounding `%`, user-injected `%` and `_` are still embedded within the final pattern and remain exploitable. This should be confirmed during exploitation by observing whether empty string matches all records.

### 7.2 PayloadCMS REST API LIKE Injection (`/api/{collection}?where[field][like]=value`)
The PayloadCMS REST API route (`src/app/(payload)/api/[...slug]/route.ts`) is auto-generated and exposes all `where` operators including `like`. Collections `Media` (`access: { read: () => true }`) and `Comments` (`access: { read: () => true }`) have explicit open read access. Other collections (Articles, Events, ForumThreads, LaunchpadProjects) have no explicit access rules and default to Payload's behavior for published content. LIKE injection via the REST API shares the same backend as the tRPC routes and is equally unescaped. This was assessed as a supplementary path, not a separate unique sink.

### 7.3 Agent `browseMembers` MCP Tool Path
The `agent.browseMembers` procedure is also exposed as a tool at `/api/mcp`. The same injection exists there, reachable via the MCP protocol with an agent API key. Full MCP tool tracing was outside scope of this analysis iteration.

### 7.4 No Classic SQL Injection Found
The codebase consistently uses Drizzle ORM parameterized queries for all value-slot comparisons and PayloadCMS for document queries. No raw SQL string concatenation was found in any network-accessible code path. Confirmed vulnerabilities are limited to LIKE-metacharacter injection. UNION attacks, stacked queries, and out-of-band exfiltration via these vectors are not possible.
