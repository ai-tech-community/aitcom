# Authentication Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Target:** `https://www.aitcommunity.org` — AIT Community platform (Next.js 15, Better Auth v1.4.5, PayloadCMS, tRPC, PostgreSQL/Neon)
- **Key Outcome:** Six authentication vulnerabilities were identified. The most critical are the **complete absence of rate limiting on every login, registration, and password-reset endpoint** — enabling unconstrained brute-force and credential-stuffing attacks — combined with the **absence of server-side password strength enforcement** and a **hardcoded fallback secret in the PayloadCMS configuration**. Transport security, session cookie flags, and session lifecycle management are properly implemented by the Better Auth library and require no further action.
- **Purpose of this Document:** This report provides strategic context on the application's authentication architecture, dominant flaw patterns, and the defensive measures that are properly implemented, to guide the Exploitation phase in prioritising and executing the vulnerabilities listed in the exploitation queue.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Absent Abuse Defences on All Authentication Endpoints

- **Description:** Not one of the three primary authentication entry points — login, registration, and password-reset — has any rate-limiting, account-lockout, or CAPTCHA protection. The in-memory rate-limiter that exists in the codebase (`src/server/agent/rate-limit.ts`) is wired only to the MCP agent-registration flow, not to the Better Auth catch-all handler (`/api/auth/[...all]`). Because Vercel deploys each serverless function independently, even the MCP in-memory limiter is ineffective across instances.
- **Implication:** An attacker can make an unlimited number of login attempts (brute-force / credential stuffing), create unlimited accounts (resource abuse / sock-puppet creation), and flood any email address with password-reset messages without being throttled or locked out.
- **Representative Findings:** `AUTH-VULN-01`, `AUTH-VULN-02`, `AUTH-VULN-03`

### Pattern 2: Weak Credential Policy with No Server-Side Enforcement

- **Description:** The only password requirement visible in the application is an HTML5 `minLength={8}` attribute on the password `<input>` field in the signup and reset-password forms. No server-side validation schema (Zod or otherwise) enforces this limit; the Better Auth `emailAndPassword` plugin is enabled without a `passwordValidator` callback. Direct API calls bypass the UI constraint entirely.
- **Implication:** Attackers can register accounts with single-character passwords, dramatically reducing the brute-force search space. Combined with the absent rate limiting, this makes credential-based attacks trivial.
- **Representative Finding:** `AUTH-VULN-04`

### Pattern 3: Error-Message Information Disclosure (User Enumeration)

- **Description:** The signup page renders the raw `error.message` string returned by Better Auth directly to the user via `toast.error(error.message)`. When an already-registered email address is submitted, Better Auth surfaces a distinct message (e.g., "Email already exists"), distinguishing it from other failure modes and enabling systematic email enumeration.
- **Implication:** Attackers can cheaply build a validated list of registered email addresses to target with credential-stuffing campaigns.
- **Representative Finding:** `AUTH-VULN-05`

---

## 3. Detailed Vulnerability Findings

### AUTH-VULN-01 — No Rate Limiting on Login Endpoint

- **Endpoint:** `POST /api/auth/sign-in/email` (handled by `src/app/api/auth/[...all]/route.ts`)
- **Evidence:** The Better Auth catch-all route is a bare `toNextJsHandler(auth.handler)` export with no wrapping middleware. The Better Auth configuration (`src/server/better-auth/config.ts`) does not enable the Better Auth rate-limiting plugin. The `src/server/agent/rate-limit.ts` module implements per-agent in-memory counters that are never applied to this route.
- **Missing Defence:** Per-IP and per-account rate limiting, progressive delay, or account lockout on `POST /api/auth/sign-in/email`.
- **Impact:** Unlimited password-guessing against any registered account.

### AUTH-VULN-02 — No Rate Limiting on Password-Reset Request Endpoint

- **Endpoint:** `POST /api/auth/forgot-password` (resolved via Better Auth catch-all)
- **Evidence:** Same root cause as AUTH-VULN-01; the catch-all handler applies no rate limiting. No Vercel middleware, WAF rule, or Better Auth plugin intercepts this route.
- **Missing Defence:** Rate limiting and/or CAPTCHA on the password-reset request flow to prevent token-guessing amplification, email bombing, and reset-flooding.
- **Impact:** Unlimited password-reset requests; attacker can trigger reset-link spam toward any email address and, if token entropy is ever reduced, attempt to guess reset tokens.

### AUTH-VULN-03 — No Rate Limiting on Account Registration Endpoint

- **Endpoint:** `POST /api/auth/sign-up/email`
- **Evidence:** The in-memory limiter at `src/server/agent/rate-limit.ts` (3 registrations/hr/IP) is imported and called only from `src/app/api/mcp/route.ts` (MCP agent registration), never from the Better Auth catch-all. The signup flow has zero throttling.
- **Missing Defence:** Per-IP rate limiting on `POST /api/auth/sign-up/email`.
- **Impact:** Automated mass account creation; resource exhaustion; sock-puppet farming.

### AUTH-VULN-04 — No Server-Side Password Strength Enforcement

- **Endpoint:** `POST /api/auth/sign-up/email` and `POST /api/auth/reset-password`
- **Evidence:** `src/server/better-auth/config.ts` — the `emailAndPassword` block sets only `enabled: true` and `requireEmailVerification: true`; no `passwordValidator` or minimum-length option is passed. Client-side enforcement is `minLength={8}` HTML attribute only (`src/app/[locale]/auth/signup/page.tsx` line 89; `src/app/[locale]/auth/reset-password/page.tsx` line 77).
- **Missing Defence:** Server-side password policy (minimum length, complexity) enforced in the Better Auth configuration or a custom `passwordValidator` callback.
- **Impact:** Accounts can be registered via direct API calls with trivially weak passwords (e.g., a single character), dramatically lowering the brute-force barrier.

### AUTH-VULN-05 — User Enumeration via Signup Error Messages

- **Endpoint:** `POST /api/auth/sign-up/email`
- **Evidence:** `src/app/[locale]/auth/signup/page.tsx` lines 29–31: `toast.error(error.message ?? "Sign up failed")`. When a duplicate email is submitted, Better Auth returns a structured error whose `.message` field distinguishes "email already exists" from other failures. This exact string is surfaced to the caller.
- **Missing Defence:** Generic, non-differentiating error response for the signup flow (e.g., a uniform "If this email is not already registered, you will receive a confirmation shortly" pattern).
- **Impact:** Systematic enumeration of all registered email addresses via the public signup endpoint.

### AUTH-VULN-06 — PayloadCMS Hardcoded Fallback Secret

- **Endpoint:** `POST /admin/login` (PayloadCMS admin panel at `/admin`)
- **Evidence:** `src/payload.config.ts` lines 146–149:
  ```typescript
  secret:
    process.env.PAYLOAD_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    "dev-secret-change-me",
  ```
  PayloadCMS uses this `secret` value to sign and verify all admin JWTs. If both `PAYLOAD_SECRET` and `BETTER_AUTH_SECRET` environment variables are absent or empty in the production deployment, all PayloadCMS admin sessions would be signed with the publicly-known string `"dev-secret-change-me"`.
- **Missing Defence:** Hard failure (`throw new Error("PAYLOAD_SECRET is not set")`) or startup-time validation that rejects a missing secret; the env validation module (`src/env.js`) does not include `PAYLOAD_SECRET` as a required variable.
- **Impact:** If the fallback is active, an attacker can craft a valid PayloadCMS admin JWT signed with the known secret and gain full admin panel access (`/admin`) without knowing any credentials.

---

## 4. Strategic Intelligence for Exploitation

- **Authentication Methods:**
  - **Human users:** Better Auth v1.4.5 email/password and GitHub OAuth, sessions stored in PostgreSQL `session` table, token delivered as HTTP cookie.
  - **AI agents:** Bearer API key (SHA-256 hash stored in `agentApiKeys.keyHash`), no session cookie.
  - **PayloadCMS admin:** Separate email/password auth system with its own JWT; max 5 attempts, 15-minute lockout.
  - **Cron endpoints:** Single shared Bearer `CRON_SECRET`; string comparison only (not timing-safe, but low external exploitability).

- **Session Token Details:**
  - Cookie name: `better-auth.session_token` (standard) / `__Secure-better-auth.session_token` (Secure-prefixed, used in production HTTPS).
  - Flags: `HttpOnly=true`, `Secure=true` (enforced by `__Secure-` browser prefix), `SameSite=lax` — all set by Better Auth library defaults.
  - Session lifetime: 7-day TTL (Better Auth default; not explicitly overridden).
  - Session invalidation on logout: confirmed server-side (PostgreSQL record deleted when `signOut()` is called).

- **Password Storage:** bcrypt (Better Auth default) — confirmed safe.

- **GitHub OAuth Identity Mapping:** Better Auth stores GitHub's numeric user `id` as `accountId` in the `account` table (`providerId="github"`, `accountId=<GitHub numeric ID>`). This is the immutable sub-equivalent, not email — nOAuth account-takeover does not apply here.

- **Reset Token Lifecycle:** Better Auth generates cryptographically random single-use reset tokens with a 1-hour TTL (library default). Token entropy is adequate; the only weakness is the absent rate limit on the request endpoint (AUTH-VULN-02).

- **Key Exploitation Sequence for the Exploitation Phase:**
  1. **Brute-force / credential stuffing:** `POST /api/auth/sign-in/email` with `{"email":"<target>","password":"<guess>"}` — no lockout, no delay, unlimited attempts.
  2. **Email enumeration pre-stuffing:** `POST /api/auth/sign-up/email` with `{"email":"<candidate>","password":"x","name":"x"}` — distinct error message on duplicate email.
  3. **Weak-password bypass confirmation:** Register a test account with a 1-character password via direct API call to confirm server-side enforcement is absent.
  4. **PayloadCMS admin JWT forge:** Craft a PayloadCMS JWT signed with `"dev-secret-change-me"` and attempt `/admin` access; or combine with the absent registration rate limit to enumerate admin credentials.

---

## 5. Secure by Design: Validated Components

These components were analysed and found to implement robust defences. They are low-priority for further authentication testing.

| Component / Flow | Endpoint / File Location | Defence Mechanism Implemented | Verdict |
|---|---|---|---|
| HTTPS Enforcement | Vercel edge / `next.config.ts` | HTTP 308 → HTTPS redirect; HSTS `max-age=63072000; includeSubDomains; preload` | SAFE |
| Session Cookie Flags | Better Auth library defaults | `HttpOnly=true`, `Secure=true` (`__Secure-` prefix browser-enforced), `SameSite=lax` | SAFE |
| Password Hashing | Better Auth `emailAndPassword` plugin | bcrypt hashing; constant-time comparison | SAFE |
| Session Invalidation on Logout | `src/components/navbar.tsx` → Better Auth `signOut()` | Server-side session record deleted from PostgreSQL on logout | SAFE |
| Session Token Entropy | Better Auth session creation | Cryptographically random token generated; stored only as opaque reference in DB | SAFE |
| Session Fixation | Better Auth auth flow | New session created on each successful login; no pre-auth session token reuse | SAFE |
| GitHub OAuth Identity Binding | `src/server/better-auth/config.ts` `socialProviders.github` | Accounts linked via GitHub numeric user `id` (immutable sub), not mutable email | SAFE |
| OAuth State / CSRF Protection | Better Auth GitHub OAuth provider | `state` parameter generated and validated internally by Better Auth library | SAFE |
| Reset Token Entropy & Single-Use | Better Auth `forgotPassword` flow | Cryptographic random token; single-use enforced; ~1 hr TTL (library default) | SAFE |
| PayloadCMS Brute-Force Protection | `src/payload.config.ts` lines 88–91 | `maxLoginAttempts: 5`, `lockTime: 900000` (15-min lockout) on `/admin/login` | SAFE |
| Agent API Key Security | `src/server/agent/api-key.ts` | 32-byte random key; SHA-256 hash stored in DB; raw key never persisted | SAFE |
| Security Response Headers | `next.config.ts` headers() config | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `COOP: same-origin`, `CORP: same-origin` | SAFE |
| Dev-Mode Trusted Origins Bypass | `src/server/better-auth/base-url.ts` lines 34–42 | `NODE_ENV === "development"` guard restricts host-header origin trust to dev environments only | SAFE (dev-only) |
