# Legal Pages (Man Page Style) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create Privacy Policy and Terms of Service pages styled as Unix man pages, with real GDPR-compliant draft content in English and Dutch.

**Architecture:** A shared `ManPageLayout` server component provides the man page chrome (header/footer lines, section formatting). Each legal page is a server component that uses `getTranslations` to pull content from i18n message files. No client JS needed.

**Tech Stack:** Next.js App Router, next-intl (server), Tailwind CSS v4, Geist Mono font

---

### Task 1: Create ManPageLayout shared component

**Files:**
- Create: `src/components/man-page-layout.tsx`

**Step 1: Create the ManPageLayout component**

This is a server component (no "use client"). It renders:
- A header line: `PAGE_NAME(7)          AIT Community          PAGE_NAME(7)` — monospace, muted, with bottom border
- Children content area with proper man page styling
- A footer line: `AIT Community Netherlands     YYYY.MM.DD     PAGE_NAME(7)` — monospace, muted, with top border

```tsx
import type { ReactNode } from "react";

interface ManPageLayoutProps {
  pageName: string;
  section?: string;
  lastUpdated: string;
  children: ReactNode;
}

export function ManPageLayout({
  pageName,
  section = "7",
  lastUpdated,
  children,
}: ManPageLayoutProps) {
  const ref = `${pageName.toUpperCase()}(${section})`;

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Man page header line */}
      <div className="border-border flex items-center justify-between border-b pb-3 font-mono text-xs tracking-wider">
        <span className="text-muted-foreground font-medium">{ref}</span>
        <span className="text-muted-foreground hidden font-medium sm:block">
          AIT Community
        </span>
        <span className="text-muted-foreground font-medium">{ref}</span>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl py-10">{children}</div>

      {/* Man page footer line */}
      <div className="border-border flex items-center justify-between border-t pt-3 font-mono text-xs tracking-wider">
        <span className="text-muted-foreground font-medium">
          AIT Community Netherlands
        </span>
        <span className="text-muted-foreground hidden font-medium sm:block">
          {lastUpdated}
        </span>
        <span className="text-muted-foreground font-medium">{ref}</span>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/man-page-layout.tsx
git commit -m "feat(legal): add ManPageLayout shared component"
```

---

### Task 2: Create ManPageSection helper component

**Files:**
- Modify: `src/components/man-page-layout.tsx`

**Step 1: Add section and TOC helper components to the same file**

Append these to `man-page-layout.tsx`:

```tsx
interface ManPageSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function ManPageSection({ id, title, children }: ManPageSectionProps) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="font-mono text-sm font-bold tracking-wider">
        {title.toUpperCase()}
      </h2>
      <div className="text-muted-foreground mt-3 space-y-3 pl-6 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

interface TocItem {
  id: string;
  label: string;
}

export function ManPageToc({ items }: { items: TocItem[] }) {
  return (
    <nav className="border-border mt-8 border p-4 font-mono text-xs">
      <span className="text-muted-foreground font-medium tracking-wider">
        TABLE OF CONTENTS
      </span>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {items.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="text-foreground hover:text-primary transition-colors"
          >
            {i + 1}. {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/man-page-layout.tsx
git commit -m "feat(legal): add ManPageSection and ManPageToc components"
```

---

### Task 3: Add English i18n content for Privacy Policy

**Files:**
- Modify: `messages/en.json`

**Step 1: Add the `privacy` namespace to `messages/en.json`**

Add a top-level `"privacy"` key with all section content. The content should be GDPR-compliant covering: account data, Mollie payments, Resend email, job/sponsor data, cookies, data retention, user rights (Dutch DPA), and contact info.

Key structure:
```json
{
  "privacy": {
    "title": "PRIVACY POLICY",
    "name": "privacy — AIT Community Netherlands Privacy Policy",
    "synopsis": "We collect only what we need to run the community...",
    "lastUpdated": "2026.02.24",
    "tocDataCollection": "DATA COLLECTION",
    "tocLegalBasis": "LEGAL BASIS",
    "tocDataSharing": "DATA SHARING",
    "tocCookies": "COOKIES & TRACKING",
    "tocRetention": "DATA RETENTION",
    "tocRights": "YOUR RIGHTS",
    "tocTransfers": "INTERNATIONAL TRANSFERS",
    "tocContact": "CONTACT",
    "dataCollectionBody": "...",
    "legalBasisBody": "...",
    "dataSharingBody": "...",
    "cookiesBody": "...",
    "retentionBody": "...",
    "rightsBody": "...",
    "transfersBody": "...",
    "contactBody": "...",
    "seeAlso": "terms(7)"
  }
}
```

Write real, substantive content for each section covering:
- **DATA COLLECTION**: Account info (name, email, GitHub OAuth), payment data processed by Mollie (we don't store card details), sponsor/employer company info, job listing data, community posts, event RSVPs, analytics (page views, anonymized)
- **LEGAL BASIS**: Consent (account creation), contract (event tickets, sponsorships), legitimate interest (analytics, community safety), legal obligation (tax records for payments)
- **DATA SHARING**: Mollie (payments), Resend (transactional email), hosting provider, no selling/renting to third parties
- **COOKIES**: Essential session cookies, optional analytics; no third-party ad tracking
- **RETENTION**: Account data kept while active + 30 days after deletion; payment records 7 years (Dutch tax law); community posts anonymized on deletion
- **RIGHTS**: Access, rectification, erasure, portability, restriction, objection; how to exercise (email); right to complain to Autoriteit Persoonsgegevens
- **TRANSFERS**: Sub-processors may be outside EEA; Standard Contractual Clauses used
- **CONTACT**: AIT Community Netherlands, email address, Amsterdam

**Step 2: Commit**

```bash
git add messages/en.json
git commit -m "feat(legal): add English privacy policy content"
```

---

### Task 4: Add English i18n content for Terms of Service

**Files:**
- Modify: `messages/en.json`

**Step 1: Add the `terms` namespace to `messages/en.json`**

Add a top-level `"terms"` key. Key structure:
```json
{
  "terms": {
    "title": "TERMS OF SERVICE",
    "name": "terms — AIT Community Netherlands Terms of Service",
    "synopsis": "Use the platform, follow the rules, be excellent to each other...",
    "lastUpdated": "2026.02.24",
    "tocAcceptance": "ACCEPTANCE",
    "tocAccounts": "ACCOUNTS",
    "tocCommunity": "COMMUNITY GUIDELINES",
    "tocEvents": "EVENTS",
    "tocSponsors": "SPONSORS & JOBS",
    "tocIp": "INTELLECTUAL PROPERTY",
    "tocLiability": "LIABILITY",
    "tocTermination": "TERMINATION",
    "tocGoverning": "GOVERNING LAW",
    "tocChanges": "CHANGES",
    "acceptanceBody": "...",
    "accountsBody": "...",
    "communityBody": "...",
    "eventsBody": "...",
    "sponsorsBody": "...",
    "ipBody": "...",
    "liabilityBody": "...",
    "terminationBody": "...",
    "governingBody": "...",
    "changesBody": "...",
    "seeAlso": "privacy(7)"
  }
}
```

Write real content covering:
- **ACCEPTANCE**: By accessing/using the site you agree; must be 16+ (GDPR age of digital consent in NL)
- **ACCOUNTS**: Accurate info required, responsible for security, one account per person
- **COMMUNITY GUIDELINES**: Respectful discourse, no spam/harassment/illegal content, English and Dutch accepted, moderator decisions are final
- **EVENTS**: Registration via platform, tickets non-transferable, refund policy (full refund 7+ days before, 50% 2-7 days, no refund <2 days), AIT may cancel/reschedule events
- **SPONSORS & JOBS**: Sponsors responsible for accurate company info, job listings must be real positions, AIT reserves right to remove listings, sponsor tier benefits as described at time of purchase
- **IP**: User retains ownership of content, grants AIT license to display; AIT branding/logo are our property; open-source contributions follow their respective licenses
- **LIABILITY**: Platform provided "as is", no warranty, AIT not liable for indirect damages, total liability capped at fees paid in last 12 months
- **TERMINATION**: Users can delete account anytime, AIT can suspend/terminate for violations, data handled per privacy policy on termination
- **GOVERNING LAW**: Dutch law, disputes in Amsterdam courts
- **CHANGES**: We may update terms, 30 days notice via email, continued use = acceptance

**Step 2: Commit**

```bash
git add messages/en.json
git commit -m "feat(legal): add English terms of service content"
```

---

### Task 5: Add Dutch i18n content for Privacy Policy and Terms

**Files:**
- Modify: `messages/nl.json`

**Step 1: Add `privacy` and `terms` namespaces to `messages/nl.json`**

Translate all content from English to Dutch. Use the same key structure. Use proper Dutch legal terminology:
- "Privacybeleid" for privacy policy
- "Algemene Voorwaarden" for terms of service
- "Autoriteit Persoonsgegevens" for Dutch DPA
- "AVG" for GDPR (Algemene Verordening Gegevensbescherming)

**Step 2: Commit**

```bash
git add messages/nl.json
git commit -m "feat(legal): add Dutch privacy policy and terms content"
```

---

### Task 6: Create Privacy Policy page

**Files:**
- Create: `src/app/[locale]/privacy/page.tsx`

**Step 1: Create the page as a server component**

```tsx
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  ManPageLayout,
  ManPageSection,
  ManPageToc,
} from "@/components/man-page-layout";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "Privacy Policy — AIT Community",
  description: "AIT Community Netherlands Privacy Policy",
};

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  const tocItems = [
    { id: "data-collection", label: t("tocDataCollection") },
    { id: "legal-basis", label: t("tocLegalBasis") },
    { id: "data-sharing", label: t("tocDataSharing") },
    { id: "cookies", label: t("tocCookies") },
    { id: "retention", label: t("tocRetention") },
    { id: "rights", label: t("tocRights") },
    { id: "transfers", label: t("tocTransfers") },
    { id: "contact", label: t("tocContact") },
  ];

  return (
    <ManPageLayout pageName="PRIVACY" lastUpdated={t("lastUpdated")}>
      {/* NAME */}
      <section>
        <h2 className="font-mono text-sm font-bold tracking-wider">NAME</h2>
        <p className="text-muted-foreground mt-2 pl-6 font-mono text-sm">
          {t("name")}
        </p>
      </section>

      {/* SYNOPSIS */}
      <section className="mt-8">
        <h2 className="font-mono text-sm font-bold tracking-wider">SYNOPSIS</h2>
        <p className="text-muted-foreground mt-2 pl-6 text-sm leading-relaxed">
          {t("synopsis")}
        </p>
      </section>

      {/* DESCRIPTION */}
      <section className="mt-8">
        <h2 className="font-mono text-sm font-bold tracking-wider">DESCRIPTION</h2>
      </section>

      <ManPageToc items={tocItems} />

      <ManPageSection id="data-collection" title={t("tocDataCollection")}>
        <p className="whitespace-pre-line">{t("dataCollectionBody")}</p>
      </ManPageSection>

      <ManPageSection id="legal-basis" title={t("tocLegalBasis")}>
        <p className="whitespace-pre-line">{t("legalBasisBody")}</p>
      </ManPageSection>

      <ManPageSection id="data-sharing" title={t("tocDataSharing")}>
        <p className="whitespace-pre-line">{t("dataSharingBody")}</p>
      </ManPageSection>

      <ManPageSection id="cookies" title={t("tocCookies")}>
        <p className="whitespace-pre-line">{t("cookiesBody")}</p>
      </ManPageSection>

      <ManPageSection id="retention" title={t("tocRetention")}>
        <p className="whitespace-pre-line">{t("retentionBody")}</p>
      </ManPageSection>

      <ManPageSection id="rights" title={t("tocRights")}>
        <p className="whitespace-pre-line">{t("rightsBody")}</p>
      </ManPageSection>

      <ManPageSection id="transfers" title={t("tocTransfers")}>
        <p className="whitespace-pre-line">{t("transfersBody")}</p>
      </ManPageSection>

      <ManPageSection id="contact" title={t("tocContact")}>
        <p className="whitespace-pre-line">{t("contactBody")}</p>
      </ManPageSection>

      {/* SEE ALSO */}
      <section className="mt-10">
        <h2 className="font-mono text-sm font-bold tracking-wider">SEE ALSO</h2>
        <p className="mt-2 pl-6 font-mono text-sm">
          <Link href="/terms" className="text-primary hover:underline">
            {t("seeAlso")}
          </Link>
        </p>
      </section>
    </ManPageLayout>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/privacy/page.tsx
git commit -m "feat(legal): add privacy policy page"
```

---

### Task 7: Create Terms of Service page

**Files:**
- Create: `src/app/[locale]/terms/page.tsx`

**Step 1: Create the page as a server component**

Same structure as the privacy page but using `terms` namespace and its section IDs:
- `acceptance`, `accounts`, `community`, `events`, `sponsors`, `ip`, `liability`, `termination`, `governing`, `changes`
- SEE ALSO links to `privacy(7)` via `/privacy`
- Metadata: "Terms of Service — AIT Community"

**Step 2: Commit**

```bash
git add src/app/[locale]/terms/page.tsx
git commit -m "feat(legal): add terms of service page"
```

---

### Task 8: Verify and test

**Step 1: Run the dev server**

```bash
pnpm dev
```

**Step 2: Manually verify**

- Visit `http://localhost:3000/en/privacy` — page renders with man page chrome, all sections, TOC links work
- Visit `http://localhost:3000/en/terms` — same checks
- Visit `http://localhost:3000/nl/privacy` — Dutch content renders
- Visit `http://localhost:3000/nl/terms` — Dutch content renders
- Click footer "Privacy Policy" link — navigates to `/privacy`
- Click footer "Terms of Service" link — navigates to `/terms`
- Click "SEE ALSO" cross-links — navigate between pages
- Check mobile responsiveness — man page header simplifies

**Step 3: Run build to catch type errors**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 4: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "feat(legal): verify legal pages build and render"
```
