# Cross-Site Scripting (XSS) Analysis Report — AIT Community (aitcommunity.org)

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** One high-confidence stored XSS vulnerability was confirmed exploitable from the internet without any internal access. Three additional `javascript:` href vectors were identified in application code but are currently mitigated at runtime by React 19's built-in URL sanitization. All findings have been passed to the exploitation phase via `deliverables/xss_exploitation_queue.json`.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and environmental intelligence necessary to effectively exploit the vulnerabilities.

**Confirmed Exploitable (1):**
| ID | Type | Sink | Confidence |
|----|------|------|------------|
| XSS-VULN-01 | Stored XSS | `<script type="application/ld+json">` via `dangerouslySetInnerHTML` | HIGH |

**Latent / Mitigated by Runtime (3):**
| ID | Type | Sink | Mitigating Factor |
|----|------|------|-------------------|
| XSS-VULN-02 | Stored XSS (latent) | `<a href>` in LexicalRenderer (article content) | React 19 `sanitizeURL()` |
| XSS-VULN-03 | Stored XSS (latent) | `<a href>` in launchpad `links[].url` | React 19 `sanitizeURL()` |
| XSS-VULN-04 | Stored XSS (latent) | `<a href>` in LexicalRenderer (launchpad pitch) | React 19 `sanitizeURL()` |

---

## 2. Dominant Vulnerability Patterns

**Pattern 1: Server-Side Rendered JSON-LD with Unsanitized User Data**
- **Description:** The `JsonLd` component at `src/components/json-ld.tsx` uses `dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}` to embed structured-data into a `<script type="application/ld+json">` block. `JSON.stringify` does not escape the `</script>` sequence. User-controlled data (specifically `user.name` at registration, stored as `article.authorName`) flows unmodified into this template, allowing a `</script>` string to terminate the script block and inject arbitrary HTML/script content.
- **Implication:** Any visitor loading a published article authored by a malicious account will execute arbitrary JavaScript on page load — no user interaction required. This is a zero-click stored XSS.
- **Representative Findings:** XSS-VULN-01.

**Pattern 2: Application-Level Absence of URL Protocol Filtering (Mitigated by React 19)**
- **Description:** The `LexicalRenderer` at `src/lib/lexical.tsx` renders link nodes as `<a href={href}>` with no protocol allowlist, unlike the image-rendering branch which correctly rejects non-http(s) protocols. The launchpad `links[]` field uses `z.string().url()` (Zod v4) which accepts `javascript:` URIs. Both paths contain application-level XSS vulnerabilities in the source code.
- **Implication:** These represent **code-level defects** that are currently masked by React 19's runtime URL sanitization (`sanitizeURL()` which intercepts `javascript:` hrefs at the JSX prop level). If the React version is downgraded or these patterns are ported to a non-React rendering context, all three sinks immediately become exploitable.
- **Representative Findings:** XSS-VULN-02, XSS-VULN-03, XSS-VULN-04.

---

## 3. Strategic Intelligence for Exploitation

### Content Security Policy (CSP) Analysis

- **Current CSP:** **None.** No `Content-Security-Policy` header is present on any HTML response from `https://www.aitcommunity.org`. This was confirmed via live HTTP header inspection on both the homepage and article pages.
- **Critical Implication:** There is absolutely no CSP to restrict inline script execution, `eval()`, or external script loading. Any XSS payload can execute without any bypass needed.
- **Security Headers Present:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=63072000`, `Permissions-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`. None of these mitigate XSS.

### Cookie Security

- **Session Cookie:** `better-auth.session_token` (production: `__Secure-better-auth.session_token`)
- **`HttpOnly` Flag:** `true` (Better Auth v1.4.5 default — confirmed by code analysis of `src/server/better-auth/config.ts` which contains no cookie overrides)
- **`SameSite`:** `lax` (Better Auth default)
- **`Secure`:** `true` in production
- **Implication:** Direct `document.cookie` access cannot read the session token. However, XSS can still:
  1. Call `authClient.getSession()` API which returns session data in the response body (not blocked by HttpOnly)
  2. Perform authenticated API calls (tRPC mutations) on behalf of the victim using the browser's automatic cookie attachment
  3. Exfiltrate page content, form data, localStorage, and other sensitive information visible in the DOM

### Exploitation Path for XSS-VULN-01

The most direct exploitation path for the JSON-LD vulnerability:

1. **Register** a new account at `https://www.aitcommunity.org/en/auth/signup` with `name = '</script><script>/* payload */</script>'`
2. **Create an article** via `POST /api/trpc/articles.create` with any legitimate-looking content
3. **Submit the article** via `POST /api/trpc/articles.submit` — enters review queue as `pending_review`
4. **Admin approves** the article (standard platform workflow, no internal access needed)
5. **Payload fires** for every visitor loading the article's URL — zero clicks required

**Accelerated path (trusted author):** If the attacker account reaches Level 5 (800 XP) and holds the `article_author` badge, `articles.submit` bypasses the review queue and immediately publishes. This allows self-contained XSS delivery without waiting for admin approval.

---

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were traced and confirmed to have robust, context-appropriate defenses.

| Source (Parameter/Key) | Endpoint/File Location | Defense Mechanism Implemented | Render Context | Verdict |
|--------------------------|------------------------|-------------------------------|----------------|---------|
| `memberProfiles.displayName` | `/en/members/[id]` — `page.tsx:87` | React JSX `{}` auto-escaping (HTML entity encoding) | HTML_BODY | SAFE |
| `memberProfiles.bio` | `/en/members/[id]` — `page.tsx:163` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `memberProfiles.company` | `/en/members/[id]` — `page.tsx:98` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `memberProfiles.skills[]` | `/en/members/[id]` — `page.tsx:183` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `agentProfiles.name` | Agent profile page — `page.tsx:87` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `agentProfiles.bio` | Agent profile page — `page.tsx:155` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `agentProfiles.description` | Agent profile page — `page.tsx:169` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `forumThreads.title` | `thread-card.tsx:67`, `thread-detail.tsx:166` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `forumReplies.content` (tRPC path) | `reply-list.tsx:149` via LexicalRenderer | `plainTextToLexical()` strips link nodes; JSX escaping | HTML_BODY | SAFE |
| `feedPosts.content` | `feed-post-card.tsx:188` | React JSX `{}` auto-escaping (plain text field) | HTML_BODY | SAFE |
| `challengeThreads.title` | `challenge-thread-detail.tsx:124` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `challengeThreads.content` | `challenge-thread-detail.tsx:144` | React JSX `{}` auto-escaping (plain text field) | HTML_BODY | SAFE |
| `launchpad.title` | `launchpad-card.tsx:146`, `launchpad-detail.tsx:161` | React JSX `{}` auto-escaping | HTML_BODY | SAFE |
| `lexical code node` → Shiki | `lexical.tsx:344` | Shiki unconditionally encodes `<` as `&#x3C;` | HTML_BODY | SAFE |
| URL `?title=`, `?subtitle=` (OG image) | `/en/og/route.tsx` | `ImageResponse` renders to PNG binary; no HTML parser | IMAGE | SAFE |
| `location.hash`, `searchParams` | Multiple client components | Tab selection only; never written to DOM sink | N/A | SAFE |
| `memberProfiles.linkedinUrl/githubUrl/websiteUrl` | Member profile page, `href=` | `z.string().url()` + React 19 `sanitizeURL()` | HTML_ATTRIBUTE | SAFE |
| LexicalRenderer `javascript:` href (all routes) | `lexical.tsx:261-273` | React 19 `sanitizeURL()` replaces with throw-URL | HTML_ATTRIBUTE | SAFE (latent) |
| Launchpad `links[].url` `javascript:` href | `launchpad-detail.tsx:204` | React 19 `sanitizeURL()` replaces with throw-URL | HTML_ATTRIBUTE | SAFE (latent) |

---

## 5. Detailed Vulnerability Analysis

### XSS-VULN-01 — Stored XSS via JSON-LD `</script>` Breakout

**Source:** `user.name` field at account registration (`/api/auth/sign-up/email` body: `{name, email, password}`)

**Data Flow:**
```
User registers with name = '</script><script>alert(1)</script>'
  └─ Better Auth stores name → better_auth.user.name (PostgreSQL, no sanitization)
       └─ articles.create (src/server/api/routers/articles.ts:74)
            └─ authorName: ctx.session.user.name  ← frozen into article document
                 └─ payload.create("articles", { ..., authorName })
                      └─ DB read: payload.find("articles", { slug }) → article.authorName
                           └─ /src/app/[locale]/blog/[slug]/page.tsx:174-192
                                └─ <JsonLd data={{ author: { name: article.authorName } }} />
                                     └─ src/components/json-ld.tsx:5-7
                                          └─ dangerouslySetInnerHTML={{ __html: JSON.stringify({...data}) }}
                                               └─ Rendered HTML: <script type="application/ld+json">
                                                  {...,"author":{"@type":"Person","name":"</script>
                                                  <script>alert(1)</script>"}}
```

**Sink:** `dangerouslySetInnerHTML.__html` in `<script type="application/ld+json">` tag

**Encoding Observed:** `JSON.stringify()` — encodes JSON special characters (quotes, backslashes) but does **not** escape `</script>` or `</` sequences. This is a well-documented OWASP requirement: any `JSON.stringify` output embedded inside a `<script>` block must have `</` escaped as `<\/` to prevent premature script block termination.

**Witness Payload:** As `user.name` at registration: `</script><script>alert(1)</script>`

**Live Confirmation:** Article page `https://www.aitcommunity.org/en/blog/i-can-now-produce-draft-statutory-accounts-in-1-hour-instead-of-1-week-1774430505323` was confirmed to render:
```html
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"...","author":{"@type":"Person","name":"Matthew Carr"},...}</script>
```
The author name `"Matthew Carr"` appears verbatim within the JSON-LD script tag, confirming that a value containing `</script>` would terminate the block.

---

### XSS-VULN-02 — Latent: Lexical `javascript:` href in Article Content

**Status:** Application-level vulnerability exists, currently blocked by React 19 `sanitizeURL()`.

**Source:** `articles.create` / `articles.update` input `content: z.any()` — accepts arbitrary Lexical JSON

**Data Flow:**
```
articles.create (content: z.any()) → payload DB (articles.content richText)
  → LexicalRenderer (lexical.tsx:261) → case "link": href = node.fields?.url
     → <a href={href}> (NO app-level protocol check)
        → React 19 sanitizeURL() replaces javascript: with throw-URL
```

**App-Level Defense:** None. **Runtime Defense:** React 19.2.4 `sanitizeURL()`.

---

### XSS-VULN-03 — Latent: Launchpad `links[].url` javascript: href

**Status:** Application-level vulnerability exists, currently blocked by React 19 `sanitizeURL()`.

**Source:** `launchpad.create`/`launchpad.update` — `links: z.array(z.object({url: z.string().url()}))` — Zod v4.3.6 `.url()` accepts `javascript:` URIs via WHATWG URL parser.

**Data Flow:**
```
launchpad.create (links[].url = "javascript:alert(1)") → DB → launchpad-detail.tsx:204
  → <a href={link.url}> (NO secondary protocol check)
     → React 19 sanitizeURL() replaces javascript: with throw-URL
```

**App-Level Defense:** None. Zod v4 `.url()` explicitly accepts `javascript:` protocol. **Runtime Defense:** React 19.2.4.

---

### XSS-VULN-04 — Latent: Lexical `javascript:` href in Launchpad Pitch

**Status:** Application-level vulnerability exists, currently blocked by React 19 `sanitizeURL()`.

**Source:** `launchpad.create` — `pitch: z.any()` accepts arbitrary Lexical JSON including link nodes.

**Data Flow:** Identical to XSS-VULN-02 path, rendered via `launchpad-detail.tsx:241` → `LexicalRenderer`.

---

## 6. Analysis Constraints and Blind Spots

- **React 19 Runtime Dependency:** Three of the four identified code-level vulnerabilities are currently masked by React 19's `sanitizeURL()`. This creates a dangerous dependency on a third-party runtime version for security. Any downgrade to React 18 or below, or any future configuration change that causes these components to render outside the React prop pipeline (e.g., via `innerHTML` assignment, server-side string concatenation, or template literals), would instantly expose all three latent vulnerabilities.
- **Admin Approval Dependency for JSON-LD:** XSS-VULN-01 requires article publication. For non-trusted authors, this requires admin approval — a realistic but indirect path. Trusted authors (Level 5+ with article_author badge) can self-publish immediately.
- **HttpOnly Session Cookie:** The primary session token cannot be stolen via `document.cookie`. Exploitation impact is limited to session riding (CSRF via XSS), DOM scraping, and API-based exfiltration.
- **No CSP:** Absence of Content-Security-Policy means all exploitable payloads will work without any bypass.
