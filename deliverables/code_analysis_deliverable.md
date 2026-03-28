# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the AIT Community application. All findings adhere to the scope criteria below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints (Next.js routes, tRPC procedures, PayloadCMS REST API)
- Endpoints requiring authentication via Better Auth session cookies or agent API keys
- The MCP (Model Context Protocol) server at `/api/mcp` which accepts both authenticated and unauthenticated requests
- Webhook endpoints receiving callbacks from Mollie and agent integrations
- Cron endpoints triggered via Vercel Cron with Bearer token authentication

### Out-of-Scope: Locally Executable Only
The following components are **out-of-scope** as they cannot be invoked through the running application's network interface:
- **CLI Scripts:** `scripts/generate-challenge.ts`, `scripts/migrate-forum-data.ts`, `scripts/seed-articles.ts`, `scripts/seed-community-rules.ts`, `scripts/seed-demo-challenge.ts`, `scripts/seed-launchpad.ts` — all require `tsx` or `ts-node` execution from a terminal
- **Database Migrations:** All files in `drizzle/` and `src/migrations/` — executed via Drizzle Kit CLI (`drizzle-kit push/migrate`)
- **Build Tools:** `eslint.config.js`, `postcss.config.js`, `prettier.config.js`, `vitest.config.ts` — dev/build-time only
- **Test Files:** `*.test.ts` and `*.test.tsx` files — executed via Vitest CLI
- **Backfill Scripts:** `src/scripts/backfill-impact-metadata.ts` — CLI-only maintenance utility

---

## 1. Executive Summary

The AIT Community application is a full-stack Next.js 15 platform built with TypeScript, PayloadCMS, tRPC, and Drizzle ORM on PostgreSQL (Neon serverless). It serves as a community platform with features including forums, events, challenges, an AI agent integration system, blog articles, community management, direct messaging, and payment processing via Mollie. The application is deployed on Vercel and uses Better Auth for session-based authentication with email/password and GitHub OAuth providers.

From a security posture perspective, the application demonstrates **above-average security engineering** for a community platform. Strong typing via TypeScript strict mode, parameterized queries via Drizzle ORM, Zod input validation on all tRPC procedures, proper API key hashing (SHA-256), AES-256-GCM encryption for third-party credentials, comprehensive HTTP security headers (HSTS, X-Frame-Options DENY, COEP/CORP), and a well-structured four-tier authorization model (public → protected → agent → community) provide a solid defensive baseline. The codebase shows intentional security decisions including SSRF protections on webhook URLs, rate limiting on agent API and registration endpoints, and email verification requirements.

However, several security concerns warrant focused penetration testing attention: (1) The **Mollie payment webhook lacks signature verification**, relying solely on server-to-server payment status fetches for validation; (2) **Webhook HMAC secrets are exposed in API responses** via the `getWebhook` tRPC procedure; (3) The **SSRF protections on webhook URLs are bypassable** via DNS rebinding and alternative IP encodings since no DNS resolution validation occurs; (4) **Rate limiting is entirely in-memory**, rendering it ineffective across Vercel's serverless function instances; (5) The **PayloadCMS secret falls back to a hardcoded string** (`"dev-secret-change-me"`) if environment variables aren't set; (6) **Unauthenticated MCP agent registration** allows creation of agent profiles and API keys with only IP-based rate limiting; and (7) The **Lexical rich-text renderer allows `javascript:` protocol in link hrefs**, creating a stored XSS vector through articles and forum posts.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **Next.js ~15.4.11** with **React 19.0.0** and **TypeScript 5.8.2** in strict mode. TypeScript's strict configuration includes `noUncheckedIndexedAccess: true`, preventing unsafe index access patterns that could lead to runtime errors. The application uses ESM modules (ES2022 target) and is deployed on **Vercel** as a serverless application, which has security implications for in-memory state (rate limiting) and function isolation.

The frontend uses **Tailwind CSS** with **shadcn/ui** components and **Lexical** as the rich-text editor for articles and forum content. Internationalization is handled via **next-intl** with English and Dutch locales. The `next.config.js` configures comprehensive HTTP security headers including `Strict-Transport-Security` (max-age=63072000 with includeSubDomains and preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` disabling camera, microphone, and geolocation. SVG images are allowed via `dangerouslyAllowSVG: true` but mitigated with a strict CSP of `"default-src 'self'; script-src 'none'; sandbox;"`. Notably, there is **no Content-Security-Policy header configured for HTML pages** — only for SVG image responses.

### Architectural Pattern

The application follows a **monolithic full-stack** pattern with clear trust boundaries:

1. **Client Layer:** React SSR pages and client components communicating via tRPC React hooks
2. **API Gateway Layer:** Next.js API routes serving as entry points — tRPC handler at `/api/trpc/[trpc]`, Better Auth at `/api/auth/[...all]`, PayloadCMS at `/api/[...slug]`, MCP at `/api/mcp`, and specialized webhook/cron routes
3. **Business Logic Layer:** tRPC routers (`src/server/api/routers/`) with Zod-validated procedures and four authorization tiers
4. **Data Layer:** Drizzle ORM with PostgreSQL (Neon serverless), using parameterized queries. Dual schema architecture — Drizzle uses the `app` schema, PayloadCMS uses the `public` schema
5. **External Services:** Mollie (payments), Resend (email), Luma (calendar events), GitHub (OAuth), Amazon S3 (media storage)

Trust boundaries exist between each layer, with the most critical boundary being between unauthenticated/public procedures and protected procedures. The `communityProcedure` adds a community membership resolution layer that enforces role-based access. Agent API key authentication represents a separate trust domain with its own scope-based authorization system.

### Critical Security Components

- **Authentication:** Better Auth v1.4.5 with email/password + GitHub OAuth, separate PayloadCMS admin auth
- **Authorization:** Four-tier tRPC procedure hierarchy (public → protected → agent → community) with inline scope checking
- **Rate Limiting:** In-memory Map-based rate limiting (60 req/min for agents, 3 registrations/hr per IP)
- **Input Validation:** Zod schemas on all tRPC inputs, `@t3-oss/env-nextjs` for environment validation
- **Encryption:** AES-256-GCM for Luma API keys, SHA-256 for API key storage, bcrypt for passwords
- **SSRF Protection:** String-based URL validation for webhook URLs (blocks private IPs, cloud metadata, localhost)
- **Webhook Security:** HMAC-SHA256 signatures on outbound webhooks, event damping to prevent agent loops

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

The application uses **Better Auth v1.4.5** as its primary authentication framework, configured in `src/server/better-auth/config.ts`. Two authentication methods are supported:

1. **Email/Password:** Enabled with mandatory email verification (`requireEmailVerification: true`). Password reset is implemented with email-based reset links sent via the Resend email service. Better Auth defaults to **bcrypt** with a work factor of 10 for password hashing. A critical caveat: if the `RESEND_API_KEY` environment variable is not set, the email sending functions silently no-op (`if (!resend) return;` in config.ts lines 66, 76), which could mean email verification emails are never sent while the requirement remains enforced, potentially locking out users or creating an inconsistent state.

2. **GitHub OAuth:** Configured with `BETTER_AUTH_GITHUB_CLIENT_ID` and `BETTER_AUTH_GITHUB_CLIENT_SECRET`. The OAuth callback is handled automatically by Better Auth at `/api/auth/callback/github`.

A separate **PayloadCMS authentication system** exists for the admin panel at `/admin`, using email/password with a 5-attempt lockout and 15-minute lockout period (`maxLoginAttempts: 5`, `lockTime: 15 * 60 * 1000`). PayloadCMS admin roles are `admin` and `editor`.

For AI agents, authentication uses **Bearer token API keys** with the prefix `ait_sk_`. Keys are 32 random bytes (base64url-encoded), stored as SHA-256 hashes in the `agentApiKeys` table. Validation in `src/server/agent/api-key.ts` hashes the provided token and queries the database, also checking agent status (must be `active` or `unclaimed`).

**Authentication API Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/sign-in/email` | POST | Email/password login |
| `/api/auth/sign-up/email` | POST | Email/password registration |
| `/api/auth/sign-out` | POST | Session logout |
| `/api/auth/callback/github` | GET | GitHub OAuth callback |
| `/api/auth/verify-email` | GET/POST | Email verification |
| `/api/auth/forgot-password` | POST | Password reset request |
| `/api/auth/reset-password` | POST | Password reset completion |
| `/api/auth/get-session` | GET | Session validation |

### Session Management and Token Security

Sessions are managed by Better Auth using cookie-based tokens. The middleware at `src/middleware.ts` (lines 29-31) checks for two cookie names: `better-auth.session_token` (standard) and `__Secure-better-auth.session_token` (Secure-prefixed variant). The `__Secure-` prefix is a browser-enforced convention requiring the `Secure` flag, confirming Better Auth uses secure cookies in production.

**Critical Finding:** There is **no explicit session cookie configuration** in this codebase for `HttpOnly`, `Secure`, or `SameSite` flags. The application relies entirely on Better Auth library defaults. No code in `src/server/better-auth/config.ts` or any other file overrides these attributes. While Better Auth's defaults are generally secure (HttpOnly=true, Secure=true in production, SameSite=lax), there is no explicit assertion of the desired configuration in the codebase.

The middleware at `src/middleware.ts` only protects two path prefixes: `/dashboard` and `/join`. It checks for cookie **existence** only, not validity — a user with an expired or tampered session cookie passes the middleware but will fail at the tRPC/API layer. The middleware matcher excludes `/api/*`, `/admin/*`, `/_next/*`, and static files, meaning the PayloadCMS admin panel has its own separate protection.

### Authorization Model

The tRPC authorization model in `src/server/api/trpc.ts` implements four procedure tiers:

1. **`publicProcedure`** (line 116): No authentication. Session data available but optional. Used for read operations like listing events, members, forum threads.
2. **`protectedProcedure`** (lines 126-138): Requires valid session with `ctx.session.user` present. Returns `UNAUTHORIZED` (401) if absent.
3. **`agentProcedure`** (line 183): Validates Bearer token from Authorization header against hashed API keys. Applies rate limiting. Injects `ctx.agent` with `{ agentId, ownerId, scopes }`.
4. **`communityProcedure`** (lines 255-257): Extends `protectedProcedure` with community membership resolution from a `slug` input. Injects community, membership, and role into context.

**Scope enforcement** for agents uses inline `requireScope()` and `requireOwner()` functions (lines 185-207) that must be explicitly called within each procedure handler — this is not middleware-based, creating a risk that new procedures could forget to check scopes.

### Community RBAC

Community roles follow a strict hierarchy in `src/server/communities/role-utils.ts`: `owner (4) > admin (3) > moderator (2) > member (1)`. The `canManageRole()` function enforces that users can only manage roles strictly below their own level. This is consistently applied in the `communities` tRPC router for operations like `setMemberRole`, `banMember`, `removeMember`, etc.

**Potential Bypass:** The `pinThread` and `lockThread` procedures in `src/server/api/routers/forum.ts` check community membership for community-scoped threads but have **no admin check for global (non-community) threads** — any authenticated user could potentially pin or lock global forum threads.

### SSO/OAuth Flows

The GitHub OAuth flow is handled entirely by Better Auth. Trusted origins are configured in `src/server/better-auth/base-url.ts` with dynamic resolution. In development mode, the request's `host` header is trusted via `x-forwarded-proto`, which could be a vector if development mode is accidentally enabled in production. In production, strict HTTPS enforcement is applied. **No explicit `state` or `nonce` parameter validation code is visible** in the codebase — this is delegated entirely to Better Auth's internal handling.

### CSRF Protection

**No explicit CSRF token mechanism exists** in this codebase. The only CSRF-related code found was translation strings. Better Auth provides built-in CSRF protection via its `trustedOrigins` mechanism, and tRPC mutations over POST benefit from same-origin policy, but there are no CSRF tokens in forms or API requests.

---

## 4. Data Security & Storage

### Database Security

The application uses **PostgreSQL via Neon serverless** (`@neondatabase/serverless` v1.0.2) with **Drizzle ORM v0.41.0**. The database connection uses SSL with certificate validation — `drizzle.config.ts` explicitly normalizes PostgreSQL SSL modes, converting `prefer`, `require`, and `verify-ca` to `verify-full` for certificate validation. The database schema lives in the `app` schema, while PayloadCMS uses the `public` schema, providing logical separation.

All database queries use Drizzle's parameterized query builder, which prevents SQL injection by default. However, there is a **LIKE injection vulnerability** in the members search at `src/server/api/routers/members.ts` (lines 188-189): `ilike(memberProfiles.displayName, '%${input.search}%')` does not escape LIKE special characters (`%`, `_`). The `communities.ts` router properly uses `escapeLike()` (lines 23-25), demonstrating awareness of the pattern, but it was not applied consistently to the members router or `agent.ts` (line 319). While this isn't SQL injection (values are parameterized), it allows unintended wildcard pattern matching.

**No database-level Row-Level Security (RLS)** policies exist. All multi-tenant data isolation is enforced at the application layer through `communityId` filters in queries and the `communityProcedure` middleware. A SQL injection or ORM bypass would expose all data across tenants.

### Sensitive Data Inventory

| Table | Sensitive Fields | Protection | Risk Level |
|-------|-----------------|------------|------------|
| `user` | `email`, `emailVerified` | Plaintext | Medium (PII) |
| `account` | `password`, `accessToken`, `refreshToken`, `idToken` | bcrypt for password; tokens plaintext | **High** — OAuth tokens unencrypted |
| `session` | `token`, `ipAddress`, `userAgent` | Plaintext | Medium |
| `verification` | `value` (token) | Plaintext with `expiresAt` | Low |
| `agentApiKeys` | `keyHash`, `keyPrefix` | SHA-256 hashed | Low (properly protected) |
| `agentProfiles` | `claimToken`, `verificationCode` | Plaintext | Medium — no expiry on verification codes |
| `agentWebhooks` | `secret` (HMAC key) | **Plaintext** | **High** — exposed in API responses |
| `communityLumaIntegrations` | `apiKeyEncrypted` | AES-256-GCM | Low (properly encrypted) |
| `eventRegistrations` | `paymentId`, `paymentStatus` | Plaintext | Low (no raw card data) |

### Data Flow Security

**Encryption at rest:** Only Luma API keys use field-level encryption (`src/server/luma/crypto.ts`) via AES-256-GCM with proper IV randomization (12 bytes per encryption), authenticated encryption with GCM auth tags, and a validated 256-bit key. OAuth tokens (`accessToken`, `refreshToken`, `idToken`) in the `account` table are **stored as plaintext** — a database breach would expose GitHub OAuth tokens.

**Webhook HMAC secrets** are stored as plaintext in the `agentWebhooks` table AND exposed in API responses. The `getWebhook` tRPC procedure (`src/server/api/routers/agent-management.ts`, lines 454-462) performs a `.select()` with no column filter, returning the `secret` field to the frontend on every query. This means every time a user views their webhook configuration, the HMAC signing secret is transmitted. Combined with an XSS vulnerability, this could allow an attacker to forge webhook signatures.

**Payment data:** The application is PCI-compliant by design — Mollie handles all payment card processing, and only `paymentId` and `paymentStatus` are stored locally. No raw card numbers ever touch the application.

### Multi-tenant Data Isolation

Community-scoped queries consistently follow the pattern: resolve community by slug → check membership → filter by `communityId`. The `communityProcedure` middleware in `src/server/api/trpc.ts` (lines 215-257) centralizes this logic. However, forum content stored in PayloadCMS collections uses `communityId` as a simple string filter with **no database-level foreign key constraint** to the Drizzle `communities` table, since they reside in separate schemas (`public` vs `app`). This creates a weak coupling where orphaned data could exist.

---

## 5. Attack Surface Analysis

### External Entry Points (In-Scope)

#### API Routes — Direct HTTP Handlers

| Route | Methods | Auth | Security Notes |
|-------|---------|------|----------------|
| `/api/auth/[...all]` | GET, POST | None (is auth) | Better Auth catch-all; login, signup, OAuth, password reset |
| `/api/trpc/[trpc]` | GET, POST | Per-procedure | Main tRPC gateway — 200+ procedures across 20 routers |
| `/api/mcp` | GET, POST, DELETE | Dual (auth + unauth) | MCP server with ~50 tools; unauthenticated registration |
| `/api/agent/webhook` | GET, PUT, DELETE | Agent API key | Webhook CRUD for agents |
| `/api/mollie/webhook` | POST | **None** | Payment webhook — **no signature verification** |
| `/api/upload` | POST | Session | Image upload (2MB limit, MIME check) |
| `/api/cron/*` (7 routes) | GET | Bearer CRON_SECRET | Scheduled jobs — shared secret for all 7 |
| `/api/[...slug]` (Payload) | ALL | PayloadCMS admin | REST API for 21 collections |

#### tRPC Procedures — High-Value Targets

**Public procedures (no auth required):**
- `forum.incrementViewCount` — Public mutation that can inflate view counts without authentication
- `events.registrationCount`, `events.getAttendees`, `events.getCommunityEvents` — Public event data
- `members.listMembers`, `members.getPublicProfile`, `members.getLeaderboard` — Public member directory
- `forum.getThreads`, `forum.getThread`, `forum.getReplies`, `forum.getRules` — Public forum data
- `communities.list`, `communities.getBySlug`, `communities.getMembers` — Public community data
- `challenges.list`, `challenges.getById`, `challenges.getLeaderboard` — Public challenge data
- `comments.list`, `sponsors.list`, `sponsors.featured`, `sponsors.jobs` — Public content

**Agent procedures (~50 procedures, API key auth):**
- Read operations: `browseThreads`, `readThread`, `browseEvents`, `browseMembers`, `searchKnowledge`, `myProfile`, `getNotifications`, `getBriefing`
- Write operations: `replyToThread`, `shareKnowledge`, `suggestTopic`, `createFeedPost`, `commentOnFeedPost`
- Challenge operations: `enrollInChallenge`, `reportObjectiveProgress`, `submitSolution`
- Community operations: `joinCommunity`, `createCommunity`, `updateCommunitySettings`
- **Sensitive:** `agentGetOwnerDMs` — Agents can read their owner's private DM conversations

**Protected procedures (session auth):**
- Profile management, article CRUD, forum posting, event registration, community management
- Agent management: key generation, webhook config, claim flow
- Inbox: messaging between members

#### MCP Server — Unauthenticated Registration

The MCP endpoint at `/api/mcp` (`src/app/api/mcp/route.ts`) accepts both authenticated and unauthenticated requests. Unauthenticated callers can access two tools:
- `register-agent` — Creates a new agent profile and API key with `contribute-limited` scope. Rate limited by IP (3/hour).
- `get-agent-guide` — Returns onboarding documentation.

Authenticated agents get access to ~50 tools spanning community management, feed operations, and more. The `check-claim-status` tool returns a claim URL containing a secret token — if MCP transport is compromised, this enables account takeover.

#### PayloadCMS REST API

PayloadCMS exposes a full REST API for all 21 collections at `/api/[collection-slug]`. Most collections default to admin-only access. Two collections have explicit public read access:
- `media` — `read: () => true` with `disablePayloadAccessControl: true` for S3 storage, making all uploaded media publicly accessible via S3 URLs
- `comments` — `read: () => true`

#### Webhook Endpoints

1. **Agent webhooks** (`/api/agent/webhook`): Managed via API key auth, with SSRF protection via `validateWebhookUrl()`. Outbound webhooks use HMAC-SHA256 signatures (`X-AIT-Signature: sha256={signature}`).
2. **Mollie payment webhook** (`/api/mollie/webhook`): **No authentication or signature verification.** Receives a payment `id` via FormData and fetches the payment status from Mollie's API. An attacker can trigger arbitrary payment ID lookups, though cannot forge payment statuses.

### Notable Out-of-Scope Components

- `scripts/seed-*.ts` — Database seeding scripts (CLI-only)
- `scripts/generate-challenge.ts` — Challenge content generator (CLI-only)
- `scripts/migrate-forum-data.ts` — Data migration utility (CLI-only)
- `drizzle/0000-0004_*.sql` — Database migration files (CLI-only)
- `src/scripts/backfill-impact-metadata.ts` — Maintenance utility (CLI-only)

### Input Validation Patterns

All tRPC procedures use **Zod schemas** for input validation, providing type-safe parsing with automatic error messages. The `@t3-oss/env-nextjs` package validates environment variables at build time. The upload endpoint validates MIME types (`image/*` prefix check) and file size (2MB limit), but relies on **client-supplied `file.type`** without server-side magic byte verification — a non-image file with a spoofed content type could bypass the check.

### Background Processing

Seven cron jobs run on Vercel Cron, all authenticated via a shared `CRON_SECRET` Bearer token:
- `webhook-dispatch` (every minute) — Dispatches queued webhooks with retry logic, max 20 events per run, max 3 retries per event, auto-disables after 10 consecutive failures
- `challenge-advisory`, `challenge-expiry`, `challenge-digest`, `impact-aggregation`, `stale-review-reminder`, `agent-purge` — Daily/hourly maintenance jobs

**Risk:** All 7 cron endpoints share a single `CRON_SECRET`. Compromise of this value enables triggering all maintenance operations, including `agent-purge` (which can delete agents and revoke keys).

---

## 6. Infrastructure & Operational Security

### Secrets Management

All secrets are managed via environment variables, validated at build time by `@t3-oss/env-nextjs` with Zod schemas (`src/env.js`). The `.env` file is properly gitignored. However, several concerns exist:

- `BETTER_AUTH_SECRET` is required but has **no minimum length validation** — a short secret weakens session token signing
- `PAYLOAD_SECRET` is optional and **falls back to `"dev-secret-change-me"`** in `src/payload.config.ts` (line 146-149). If deployed without setting this variable, the PayloadCMS encryption key would be a publicly known string
- `SKIP_ENV_VALIDATION` (env.js line 65) bypasses all environment validation, allowing the app to start with missing or invalid secrets
- No secret rotation mechanisms are visible in the codebase
- API keys can be generated and revoked via the `agentManagement` router, but there is no scheduled rotation

### Configuration Security

**HTTP Security Headers** (configured in `next.config.js`):
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — 2-year HSTS with preload
- `X-Frame-Options: DENY` — Clickjacking protection
- `X-Content-Type-Options: nosniff` — MIME sniffing prevention
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

**Missing:** No `Content-Security-Policy` header for HTML pages. CSP is only configured for SVG image responses (`"default-src 'self'; script-src 'none'; sandbox;"`). This is a significant gap for XSS mitigation on the main web application.

**Deployment:** `vercel.json` configures three cron jobs (challenge-advisory daily, challenge-expiry daily, webhook-dispatch every minute). No Nginx, Kubernetes Ingress, or CDN configuration files are present — the application runs directly on Vercel's managed platform.

### External Dependencies

| Service | Purpose | Security Mechanism |
|---------|---------|-------------------|
| **Mollie** (v4.4.0) | Payment processing | API key auth; webhook **lacks signature verification** |
| **Resend** (v6.9.2) | Email delivery | API key auth; from: `noreply@mailer.aitcommunity.org` |
| **Luma** (custom client) | Calendar/events | AES-256-GCM encrypted API key; 10s fetch timeout |
| **GitHub** | OAuth provider | Client ID/secret via Better Auth |
| **Amazon S3** | Media storage | Access key/secret; files publicly accessible |
| **Neon** | PostgreSQL database | Connection string with SSL verify-full |

### Monitoring & Logging

Logging is minimal and development-oriented:
- tRPC timing middleware logs procedure paths and execution time in development only (`src/server/api/trpc.ts` line 104)
- `console.error` calls scattered in error handlers (events router, webhook dispatch)
- **Risk:** Error logging in the events router (`src/server/api/routers/events.ts` line 449) could leak decrypted Luma API keys if the client includes them in error objects
- No structured logging, audit trail, or security event monitoring is visible
- No request ID tracking for correlating requests across components

---

## 7. Overall Codebase Indexing

The codebase follows a standard Next.js App Router structure with 418 source files in `src/`. The root directory contains configuration files (`next.config.js`, `drizzle.config.ts`, `tsconfig.json`, `package.json`, `vercel.json`, `eslint.config.js`) and a `pnpm-lock.yaml` managing dependencies. The `src/app/` directory organizes routes using Next.js file-based routing with two main route groups: `(payload)` for the PayloadCMS admin panel and `[locale]` for the internationalized frontend. API routes reside in `src/app/api/` with subdirectories for `auth`, `agent`, `cron`, `mcp`, `mollie`, `trpc`, and `upload`.

The server-side business logic is concentrated in `src/server/`, which contains the core security-relevant code: `better-auth/` (authentication configuration and utilities), `agent/` (API key management, rate limiting, webhook dispatch, URL validation), `api/` (tRPC router root and all 20+ procedure routers), `db/` (Drizzle ORM schema and database connection), `challenge-engine/` (challenge generation and publishing), `communities/` (role utilities and slug helpers), `luma/` (Luma calendar integration with encryption), and individual files for `email.ts`, `mollie.ts`, and `payload.ts`. Collections for PayloadCMS are defined in `src/collections/` with 21 collection types. The `src/components/` directory contains ~170 React components organized by feature (agent, ai-elements, article-editor, communities, community, forum, impact, inbox, launchpad, notifications, ui). Frontend state management uses tRPC React hooks (`src/trpc/`) with SuperJSON serialization. Database migrations exist in both `drizzle/` (SQL files for the `app` schema) and `src/migrations/` (TypeScript migrations for PayloadCMS). The `scripts/` directory contains 6 CLI-only maintenance scripts for seeding and migration. The `public/` directory contains static assets including logos, images, and a Lottie JSON animation. The `docs/` directory contains design and planning documents but no API documentation or schema files. The `messages/` directory contains i18n translation files for English and Dutch.

For security analysis, the most critical directories are `src/server/` (all server-side logic), `src/app/api/` (all network entry points), `src/collections/` (PayloadCMS access control), and `src/middleware.ts` (route protection). The absence of formal API schema documentation (no OpenAPI/Swagger/GraphQL schemas) means the tRPC type system and MCP tool definitions are the only machine-readable API definitions available. No infrastructure configuration files (Nginx, Kubernetes, CDN) exist — the application relies entirely on Vercel's managed platform.

---

## 8. Critical File Paths

### Configuration
- `next.config.js` — HTTP security headers, image domains, SVG CSP
- `vercel.json` — Cron job schedule (3 jobs)
- `drizzle.config.ts` — Database connection and SSL configuration
- `src/env.js` — Environment variable validation with Zod
- `src/payload.config.ts` — PayloadCMS configuration, secret fallback, S3 storage, admin auth
- `.env.example` — Environment variable template with all required secrets
- `tsconfig.json` — TypeScript strict mode configuration
- `package.json` — Dependency versions and scripts

### Authentication & Authorization
- `src/server/better-auth/config.ts` — Better Auth configuration (providers, email verification, hooks)
- `src/server/better-auth/server.ts` — Server-side auth handler
- `src/server/better-auth/client.ts` — Client-side auth hooks
- `src/server/better-auth/base-url.ts` — Base URL resolution and trusted origins
- `src/app/api/auth/[...all]/route.ts` — Auth API catch-all route
- `src/server/api/trpc.ts` — tRPC context creation, 4-tier procedure hierarchy, rate limiting integration
- `src/server/agent/api-key.ts` — Agent API key generation and SHA-256 hashing
- `src/server/agent/rate-limit.ts` — In-memory rate limiting (3 limiters)
- `src/server/communities/role-utils.ts` — Community RBAC hierarchy and `canManageRole()`
- `src/middleware.ts` — Route protection middleware (cookie existence check)

### API & Routing
- `src/server/api/root.ts` — tRPC router aggregation
- `src/server/api/routers/agent.ts` — Agent API procedures (~30+ procedures)
- `src/server/api/routers/agent-management.ts` — Agent management (key generation, webhook CRUD, claim flow)
- `src/server/api/routers/agent-feed.ts` — Agent feed procedures
- `src/server/api/routers/agent-communities.ts` — Agent community procedures
- `src/server/api/routers/communities.ts` — Community CRUD and membership management
- `src/server/api/routers/forum.ts` — Forum threads, replies, ideas, rules
- `src/server/api/routers/events.ts` — Event registration and Mollie payment integration
- `src/server/api/routers/members.ts` — Member profiles and search (LIKE injection)
- `src/server/api/routers/articles.ts` — Article CRUD
- `src/server/api/routers/inbox.ts` — Direct messaging (including `agentGetOwnerDMs`)
- `src/server/api/routers/challenges.ts` — Challenge enrollment and submissions
- `src/server/api/routers/launchpad.ts` — Launchpad projects
- `src/server/api/routers/notifications.ts` — Notification management
- `src/server/api/routers/onboarding.ts` — Onboarding flow
- `src/server/api/routers/benchmark.ts` — Benchmark submissions
- `src/server/api/routers/sponsors.ts` — Sponsor listings
- `src/server/api/routers/luma.ts` — Luma calendar integration
- `src/server/api/routers/feed.ts` — Community feed posts
- `src/server/api/routers/activity.ts` — Activity feed
- `src/server/api/routers/impact.ts` — Impact metrics
- `src/server/api/routers/challenge-engine.ts` — Challenge engine signals
- `src/server/api/routers/challenge-channel.ts` — Challenge discussion channels
- `src/server/api/routers/comments.ts` — Comments
- `src/server/api/routers/post.ts` — Posts (demo/hello)
- `src/app/api/mcp/route.ts` — MCP server (unauthenticated registration + authenticated tools)
- `src/app/api/mcp/registration-tools.ts` — MCP agent registration tools
- `src/app/api/mcp/community-tools.ts` — MCP community management tools
- `src/app/api/mcp/feed-tools.ts` — MCP feed tools
- `src/app/api/trpc/[trpc]/route.ts` — tRPC HTTP handler
- `src/app/(payload)/api/[...slug]/route.ts` — PayloadCMS REST API
- `src/app/api/upload/route.ts` — File upload endpoint

### Webhook & Cron
- `src/app/api/agent/webhook/route.ts` — Agent webhook CRUD
- `src/app/api/mollie/webhook/route.ts` — Mollie payment webhook (**no signature verification**)
- `src/server/agent/webhook-dispatch.ts` — Outbound webhook dispatch with SSRF protection
- `src/server/agent/validate-webhook-url.ts` — Webhook URL SSRF validation
- `src/app/api/cron/agent-purge/route.ts` — Agent cleanup cron
- `src/app/api/cron/challenge-advisory/route.ts` — Challenge advisory cron
- `src/app/api/cron/challenge-digest/route.ts` — Challenge digest cron
- `src/app/api/cron/challenge-expiry/route.ts` — Challenge expiry cron
- `src/app/api/cron/impact-aggregation/route.ts` — Impact aggregation cron
- `src/app/api/cron/stale-review-reminder/route.ts` — Stale review reminder cron
- `src/app/api/cron/webhook-dispatch/route.ts` — Webhook dispatch cron

### Data Models & DB Interaction
- `src/server/db/schema.ts` — Complete database schema (1511 lines, all tables)
- `src/server/db/index.ts` — Database connection (Neon serverless with SSL)
- `src/collections/Articles.ts` — Article collection (PayloadCMS)
- `src/collections/Comments.ts` — Comments collection (public read access)
- `src/collections/Media.ts` — Media collection (public read, S3 storage, disabled access control)
- `src/collections/ForumThreads.ts` — Forum threads collection
- `src/collections/ForumReplies.ts` — Forum replies collection
- `src/collections/Events.ts` — Events collection
- `src/collections/FeedPosts.ts` — Feed posts collection
- `src/collections/FeedComments.ts` — Feed comments collection
- `src/collections/FeedLikes.ts` — Feed likes collection
- `src/collections/CommunityIdeas.ts` — Community ideas collection
- `src/collections/CommunityRules.ts` — Community rules collection
- `src/collections/Challenges.ts` — Challenges collection
- `src/collections/LaunchpadProjects.ts` — Launchpad projects collection
- `src/collections/Jobs.ts` — Jobs collection
- `src/collections/Sponsors.ts` — Sponsors collection
- `src/collections/SponsorApplications.ts` — Sponsor applications collection
- `src/collections/Speakers.ts` — Speakers collection
- `src/collections/Pages.ts` — Pages collection
- `src/collections/IdeaVotes.ts` — Idea votes collection
- `src/collections/RulesAcceptance.ts` — Rules acceptance collection
- `drizzle/0000_bumpy_marrow.sql` — Initial schema migration
- `drizzle/0001_add_notifications_table.sql` — Notifications table
- `drizzle/0002_add_notification_index.sql` — Notification index
- `drizzle/0003_add_launchpad_tables.sql` — Launchpad tables
- `drizzle/0004_add_communities.sql` — Communities tables

### Dependency Manifests
- `package.json` — npm dependencies (Better Auth, PayloadCMS, Drizzle, tRPC, Mollie, Resend, etc.)
- `pnpm-lock.yaml` — Locked dependency versions

### Sensitive Data & Secrets Handling
- `src/server/luma/crypto.ts` — AES-256-GCM encryption implementation for Luma API keys
- `src/server/agent/api-key.ts` — SHA-256 API key hashing
- `src/server/mollie.ts` — Mollie payment client initialization

### Middleware & Input Validation
- `src/middleware.ts` — Next.js middleware (locale detection, route protection)
- `src/server/agent/validate-webhook-url.ts` — SSRF protection for webhook URLs

### Content Rendering (XSS-relevant)
- `src/lib/lexical.tsx` — Lexical JSON to React renderer (**`javascript:` href vulnerability** at line 261)
- `src/components/json-ld.tsx` — JSON-LD script injection
- `src/components/ai-elements/schema-display.tsx` — dangerouslySetInnerHTML usage
- `src/components/event-register-button.tsx` — window.location.href assignment
- `src/components/communities/feed/feed-post-card.tsx` — Feed post rendering
- `src/components/forum/thread-detail.tsx` — Forum thread rendering via Lexical
- `src/components/forum/reply-list.tsx` — Forum reply rendering via Lexical

### Logging & Monitoring
- `src/server/api/trpc.ts` — tRPC timing middleware (dev-only logging)
- `src/server/email.ts` — Email sending with HTML escaping

### Infrastructure & Deployment
- `vercel.json` — Vercel deployment configuration with cron schedules
- `next.config.js` — HTTP security headers, image optimization, webpack config

### Special Routes
- `src/app/agent.md/route.ts` — Static agent guide (public)
- `src/app/skill.md/route.ts` — Static skill description (public)
- `src/app/feed.xml/route.ts` — RSS feed with XML escaping
- `src/app/robots.ts` — robots.txt
- `src/app/sitemap.ts` — Dynamic sitemap
- `src/app/[locale]/og/route.tsx` — OpenGraph image generator

### Auth Pages
- `src/app/[locale]/auth/signin/page.tsx` — Sign-in page
- `src/app/[locale]/auth/signup/page.tsx` — Sign-up page
- `src/app/[locale]/auth/forgot-password/page.tsx` — Forgot password page
- `src/app/[locale]/auth/reset-password/page.tsx` — Reset password page
- `src/app/[locale]/claim/[token]/page.tsx` — Agent claim page (token in URL path)
- `src/app/[locale]/join/[code]/page.tsx` — Community invite acceptance

---

## 9. XSS Sinks and Render Contexts

### Network Surface Focus
All findings below are on web application pages served by the Next.js application server, accessible via network requests.

### Finding 9.1 — Link `href` allows `javascript:` protocol (MEDIUM Severity)
- **File:** `src/lib/lexical.tsx`, lines 260-274
- **Sink:** `<a href={href}>` where `href = node.fields?.url ?? node.url ?? "#"`
- **Render Context:** HTML Attribute Context — URL-based attribute (`href`)
- **Data Flow:** User-authored link URLs stored in Lexical JSON content (articles, forum posts, forum replies). The Lexical editor allows users to insert links with arbitrary URLs. When rendered, the `LexicalRenderer` component creates an `<a>` tag with the URL directly as the `href` attribute.
- **Vulnerability:** Unlike images (which validate protocol on lines 284-287 of the same file), link `href` values have **no protocol validation**. A stored `javascript:alert(document.cookie)` URL in a Lexical link node would execute JavaScript when clicked. React 19 has partial protections against `javascript:` in href (console warnings), but these are not reliable XSS prevention.
- **Impact:** Stored XSS via articles, forum threads, and forum replies. Any user who can create content with links can inject `javascript:` URIs that execute when other users click them.
- **Affected Components:** `src/components/forum/thread-detail.tsx` (line 298), `src/components/forum/reply-list.tsx` (line 149), article pages — all use `<LexicalRenderer>`.

### Finding 9.2 — `dangerouslySetInnerHTML` in Shiki code highlighting (LOW Severity)
- **File:** `src/lib/lexical.tsx`, line 344
- **Sink:** `dangerouslySetInnerHTML={{ __html: html }}` where `html` comes from `shiki`'s `codeToHtml()`
- **Render Context:** HTML Body Context
- **Data Flow:** User-authored code blocks from Lexical JSON are processed by Shiki's syntax highlighter, and the resulting HTML is injected via `dangerouslySetInnerHTML`.
- **Assessment:** LOW — Shiki is a trusted syntax highlighter that tokenizes code strings and produces sanitized HTML output. The user-provided code is input to the tokenizer, not directly interpolated.

### Finding 9.3 — JSON-LD `<script>` tag injection (LOW Severity)
- **File:** `src/components/json-ld.tsx`, lines 5-7
- **Sink:** `dangerouslySetInnerHTML={{ __html: JSON.stringify({...data}) }}` inside `<script type="application/ld+json">`
- **Render Context:** JavaScript Context — inside a `<script>` tag
- **Data Flow:** Article metadata (titles, descriptions, author names) are serialized via `JSON.stringify` into a JSON-LD script tag.
- **Assessment:** LOW — `JSON.stringify` escapes special characters, but if any value contains the literal string `</script>`, it could theoretically break out of the script tag in certain environments. Defense-in-depth: replace `</` with `<\/` in output.

### Finding 9.4 — Schema display path `dangerouslySetInnerHTML` (LOW Severity)
- **File:** `src/components/ai-elements/schema-display.tsx`, line 180
- **Sink:** `dangerouslySetInnerHTML={{ __html: children ?? highlightedPath }}`
- **Render Context:** HTML Body Context
- **Data Flow:** `path` from React context; `highlightedPath` constructed via regex replacement. Currently only called with code-defined paths, not user input.
- **Assessment:** LOW — Currently safe but fragile. If a caller passes user-controlled `children` as a string, this becomes an XSS vector.

### Additional Observations
- **No `eval()`, `new Function()`, or `setTimeout`/`setInterval` with string arguments** found anywhere in the codebase.
- **No `innerHTML`, `outerHTML`, or `document.write`** direct DOM manipulation found.
- **No jQuery** usage detected.
- **`window.location.href = data.checkoutUrl`** in `src/components/event-register-button.tsx` (line 37) assigns a URL from the Mollie payment API response — trusted source, not user-controlled. LOW risk.
- **RSS feed** (`src/app/feed.xml/route.ts`) properly escapes all user content via `escapeXml()`.
- **Email templates** (`src/server/email.ts`) properly escape HTML via `escapeHtml()` and URL-encode path segments.
- **OG image route** (`src/app/[locale]/og/route.tsx`) renders `title` and `subtitle` query params as React children in JSX (SVG-based ImageResponse), not as raw HTML. Safe.
- **Forum and feed post content** rendered as React children (auto-escaped). Safe except when processed through `LexicalRenderer` (see Finding 9.1).

---

## 10. SSRF Sinks

### Network Surface Focus
All findings below are in server-side code paths reachable via network requests to the deployed application.

### Finding 10.1 — Webhook Dispatch (MEDIUM Severity)
- **File:** `src/server/agent/webhook-dispatch.ts`, line 125
- **HTTP Client:** `fetch(webhook.url, { method: "POST", headers, body, signal })`
- **User-Controlled Data:** `webhook.url` — URL registered by an authenticated agent via the `upsertWebhook` tRPC mutation
- **Code Path:** Invoked from `/api/cron/webhook-dispatch` (network-accessible cron endpoint), which calls `dispatchWebhooks()` to process queued events. Also invoked directly from the `testWebhook` mutation.
- **SSRF Protections:** `validateWebhookUrl()` is called at line 53 before each dispatch, AND at registration time
- **Bypass Vectors:**
  1. **DNS rebinding:** Hostname resolves to public IP at validation time, then changes to private IP before fetch. Validation happens at both registration and dispatch time, but DNS rebinding affects both equally.
  2. **IPv4-mapped IPv6:** `::ffff:127.0.0.1` or `::ffff:10.0.0.1` in bracket form `[::ffff:127.0.0.1]` bypasses the IPv6 check which only looks for `fc`, `fd`, `fe80` prefixes.
  3. **Alternative IP encodings:** Hex (`0x7f000001`), decimal (`2130706433`), or octal (`017700000001`) representations of private IPs bypass the regex-based dotted-decimal checks at line 48.
  4. **No DNS resolution check:** The validator never performs actual DNS resolution to verify the resolved IP. A domain like `internal.attacker.com` resolving to `10.0.0.1` passes all hostname string checks.

### Finding 10.2 — Webhook Test (MEDIUM Severity)
- **File:** `src/server/api/routers/agent-management.ts`, line 597
- **HTTP Client:** `fetch(webhook.url, { method: "POST", headers, body })`
- **User-Controlled Data:** Same user-registered webhook URL as Finding 10.1
- **Code Path:** tRPC `testWebhook` mutation, requires authenticated session
- **SSRF Protections:** `validateWebhookUrl()` called at line 581 before fetch
- **Bypass Vectors:** Same as Finding 10.1

### Finding 10.3 — Twitter oEmbed Fetch (VERY LOW Severity)
- **File:** `src/server/api/routers/agent-management.ts`, line 1067
- **HTTP Client:** `fetch(oembedUrl)` where `oembedUrl = "https://publish.twitter.com/oembed?url=" + encodeURIComponent(input.tweetUrl)`
- **User-Controlled Data:** `input.tweetUrl` — user-supplied tweet URL for agent verification
- **Code Path:** tRPC `submitVerification` mutation, requires authenticated session
- **SSRF Protections:** Base URL hardcoded to `https://publish.twitter.com/oembed`; user input only influences a query parameter via `encodeURIComponent`. Additionally, a regex validates tweet URL format before the fetch.
- **Assessment:** Not exploitable for SSRF — the fetch destination is always `publish.twitter.com`.

### Finding 10.4 — Luma API Client (VERY LOW Severity)
- **File:** `src/server/luma/client.ts`, line 45
- **HTTP Client:** `fetch(url.toString(), { headers, signal })` with 10-second timeout
- **User-Controlled Data:** `calendarApiId` and other parameters go into query strings only; `apiKey` into headers
- **Code Path:** Called from `lumaRouter` tRPC procedures (authenticated community admin only)
- **SSRF Protections:** Base URL is hardcoded constant `LUMA_BASE = "https://public-api.luma.com"` at line 1. `new URL(path, LUMA_BASE)` ensures the host cannot be overridden.
- **Assessment:** Not exploitable — host is hardcoded; user input only goes into query params or headers.

### Finding 10.5 — Mollie Payments SDK (NEGLIGIBLE Severity)
- **Files:** `src/server/api/routers/events.ts` (line 111, `mollie.payments.create`), `src/app/api/mollie/webhook/route.ts` (line 33, `mollie.payments.get`)
- **HTTP Client:** Mollie SDK (internal HTTP calls)
- **User-Controlled Data:** Event title into `description`, event ID into metadata; payment ID from webhook form data
- **Assessment:** Mollie SDK hardcodes its API base URL. Not exploitable for SSRF.

### Finding 10.6 — Resend Email SDK (NEGLIGIBLE Severity)
- **File:** `src/server/email.ts`, multiple functions
- **HTTP Client:** Resend SDK
- **User-Controlled Data:** Recipient email from database records; subject/body contain user strings (HTML-escaped)
- **Assessment:** Resend SDK controls the API endpoint. Not exploitable for SSRF.

### Redirect Handlers
- `src/middleware.ts` (line 35): Sets a `redirect` query parameter from the request pathname for post-login redirects. Constructed server-side from the request path, not from user-supplied query parameters. No open redirect risk identified.
- Claim page and join page use hardcoded redirect paths.

### Summary
The **webhook dispatch system** (Findings 10.1, 10.2) represents the only meaningful SSRF attack surface. The `validateWebhookUrl()` function provides string-based protections but is bypassable via DNS rebinding and alternative IP encodings. All other outbound HTTP requests use hardcoded destinations with user input only influencing query parameters, headers, or request bodies — not the target host.

### Recommended Mitigations
1. Perform DNS resolution during validation and verify resolved IPs against private ranges
2. Block IPv4-mapped IPv6 addresses (`::ffff:*`)
3. Handle alternative IP encodings (hex, decimal, octal)
4. Consider using a library like `ssrf-req-filter` that hooks into DNS resolution at fetch time
5. Implement an allowlist approach rather than blocklist for webhook URLs
