# Legal Pages Design — Man Page Style

## Overview

Create Privacy Policy and Terms of Service pages styled as Unix man pages, matching the site's hacker/technical aesthetic. Real GDPR-compliant draft content covering account data, Mollie payments, job/sponsor data, and community use.

## Visual Design

Both pages use the same `ManPageLayout` wrapper component.

### Man Page Chrome

```
┌──────────────────────────────────────────────────┐
│ PRIVACY(7)          AIT Community          PRIVACY(7) │
├──────────────────────────────────────────────────┤
│  ... page content ...                                  │
├──────────────────────────────────────────────────┤
│ AIT Community Netherlands     2026.02.24    PRIVACY(7) │
└──────────────────────────────────────────────────┘
```

- Header/footer: monospace, muted color, border-separated
- Page name in `NAME(7)` format on both sides, `AIT Community` centered
- Footer includes last-updated date in `YYYY.MM.DD` format
- Mobile: drop center text, keep `NAME(7)` on left only

### Section Structure

Each page follows real man page conventions:

- **NAME** — one-line description (`privacy — AIT Community Privacy Policy`)
- **SYNOPSIS** — plain-English TL;DR summary (the "less boring" hook)
- **DESCRIPTION** — full content in numbered subsections
- **SEE ALSO** — cross-links to other legal pages using `terms(7)` / `privacy(7)` convention

### Formatting

- Section headings: all-caps monospace, no indent
- Body text: 4-space indent under headings (via left padding)
- Table of contents: bordered box with numbered section list, anchor links
- Subsection headings: numbered, all-caps monospace, slightly indented

## Content Scope

### Privacy Policy (`/privacy`)

1. DATA COLLECTION — account data, payment data (Mollie), job/sponsor data, analytics
2. LEGAL BASIS — GDPR Article 6 lawful bases per category
3. DATA SHARING — Mollie, Resend, hosting providers; no selling data
4. COOKIES & TRACKING — session cookies, analytics
5. DATA RETENTION — retention periods per data type
6. YOUR RIGHTS — access, rectification, erasure, portability, complaint to Dutch DPA (Autoriteit Persoonsgegevens)
7. INTERNATIONAL TRANSFERS — sub-processors outside EEA
8. CONTACT — data controller info

### Terms of Service (`/terms`)

1. ACCEPTANCE — agreement by use
2. ACCOUNTS — registration, responsibilities
3. COMMUNITY GUIDELINES — acceptable use, content policy
4. EVENTS — registration, cancellation, refunds via Mollie
5. SPONSORS & JOBS — sponsor obligations, job listing terms
6. INTELLECTUAL PROPERTY — user content license, AIT branding
7. LIABILITY — limitation of liability, disclaimers
8. TERMINATION — account suspension/deletion
9. GOVERNING LAW — Dutch law, Amsterdam jurisdiction
10. CHANGES — notification of policy changes

## Technical Implementation

### Files

- `src/components/man-page-layout.tsx` — shared wrapper (Server Component)
- `src/app/[locale]/privacy/page.tsx` — privacy policy page
- `src/app/[locale]/terms/page.tsx` — terms of service page
- `messages/en.json` — English content under `privacy` and `terms` namespaces
- `messages/nl.json` — Dutch content under same namespaces

### Component: ManPageLayout

Props:
- `pageName`: string (e.g. `"PRIVACY"`, `"TERMS"`)
- `section`: string (e.g. `"7"` for miscellaneous)
- `lastUpdated`: string (date in `YYYY.MM.DD` format)
- `children`: ReactNode

Renders header chrome, scrollable content area, footer chrome. Pure server component, no client JS.

### i18n

All legal content lives in message files under `privacy.*` and `terms.*` namespaces. Section content uses rich text with `\n` for paragraphs. The `getTranslations` server function is used (no client component needed).

### SEO

Standard Next.js `metadata` export on each page for title/description.

### No New Dependencies

Uses only existing: Tailwind, next-intl, Geist Mono font.
