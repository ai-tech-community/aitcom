# No Need to Hack Us Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a new localized trust page (`/security`) with playful transparency copy, balanced disclosure boundaries, and clear responsible-disclosure contact details.

**Architecture:** Reuse the existing static page pattern (`ManPageLayout`) to keep visual consistency with legal pages, add a new `security` translation namespace in both locales, and add a footer legal link for discoverability. Keep all security details high-level and policy-oriented to avoid oversharing implementation internals.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Tailwind CSS

---

### Task 1: Add translation content for the security page

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add English `security` namespace**

Insert a new top-level `security` object in `messages/en.json` with keys for:
- `title`, `name`, `synopsis`, `lastUpdated`
- TOC labels: `tocRun`, `tocProtect`, `tocBoundaries`, `tocDisclosure`, `tocTrust`
- Section bodies:
  - `runBody`
  - `protectBody`
  - `boundariesBody`
  - `disclosureBody`
  - `trustBody`
- CTA labels: `privacyLink`, `termsLink`, `reportLink`

Use approved tone:
- Hero line includes "No need to hack us"
- Humor only in short one-liners
- Factual body copy for controls and boundaries

**Step 2: Add Dutch `security` namespace**

Add matching keys in `messages/nl.json` with natural Dutch phrasing. Keep structure identical to English namespace.

**Step 3: Add footer label keys**

Extend `footer` namespace in both locale files with:
- `security`: "Security & Transparency" (EN)
- `security`: "Security & Transparantie" (NL)

**Step 4: Validate locale JSON files**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/nl.json','utf8')); console.log('OK')"
```

Expected: `OK`

**Step 5: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add security transparency page copy for en/nl"
```

---

### Task 2: Create localized `/security` page

**Files:**
- Create: `src/app/[locale]/security/page.tsx`

**Step 1: Add page metadata and alternates**

Use the same metadata pattern as privacy/terms pages:
- `buildAlternates('/security')`
- `buildOgMeta('Security & Transparency', 'How AIT handles platform transparency and security boundaries')`

**Step 2: Implement page using `ManPageLayout`**

Build the page with these sections in this order:
1. `NAME`
2. `SYNOPSIS`
3. `DESCRIPTION`
4. `ManPageToc`
5. `What We Run`
6. `How We Protect Members`
7. `What We Don't Publish`
8. `Found Something?`
9. `Trust Links`

Implementation constraints:
- Get translations via `getTranslations('security')`
- Render bodies with `whitespace-pre-line`
- Use localized links to `/privacy`, `/terms`, and `mailto:info@klevox.com`
- Keep jokes out of body paragraphs; place them in heading/synopsis only

**Step 3: Verify route compiles**

Run:
```bash
pnpm typecheck
```

Expected: no TypeScript errors from new route.

**Step 4: Commit**

```bash
git add src/app/[locale]/security/page.tsx
git commit -m "feat(security): add public security and transparency page"
```

---

### Task 3: Add discoverability link in footer legal section

**Files:**
- Modify: `src/components/footer.tsx`

**Step 1: Add new legal link**

In the existing footer legal nav, add a localized link:
- `href="/security"`
- label from `t('security')`

Place it with existing legal links (`privacy`, `terms`) to keep discoverability consistent.

**Step 2: Verify no regression in footer rendering**

Run:
```bash
pnpm lint
```

Expected: lint passes and no JSX/type issues in footer.

**Step 3: Commit**

```bash
git add src/components/footer.tsx
git commit -m "feat(footer): add security transparency link to legal section"
```

---

### Task 4: Add minimal content safeguards for accidental oversharing

**Files:**
- Modify: `src/app/[locale]/security/page.tsx`

**Step 1: Add explicit boundary note in page copy placement**

Ensure the `What We Don't Publish` section is rendered before disclosure/reporting section so readers see boundaries first.

**Step 2: Verify prohibited detail types are absent**

Run:
```bash
rg -n "token|secret|internal endpoint|topology|admin url" src/app/[locale]/security/page.tsx messages/en.json messages/nl.json
```

Expected:
- only policy-level mentions like "we do not publish secrets"
- no concrete secret formats, URLs, or endpoint identifiers

**Step 3: Commit (if edits required)**

```bash
git add src/app/[locale]/security/page.tsx messages/en.json messages/nl.json
git commit -m "chore(security): tighten disclosure boundaries in copy"
```

---

### Task 5: End-to-end verification and QA

**Files:**
- Verify: `src/app/[locale]/security/page.tsx`
- Verify: `src/components/footer.tsx`
- Verify: `messages/en.json`
- Verify: `messages/nl.json`

**Step 1: Run full static checks**

Run:
```bash
pnpm check
```

Expected: lint + typecheck pass.

**Step 2: Run production build**

Run:
```bash
pnpm build
```

Expected: successful Next.js production build.

**Step 3: Manual browser QA**

Run dev server:
```bash
pnpm dev
```

Validate:
- `/en/security` loads with all sections and TOC anchors
- `/nl/security` loads with translated content
- Footer legal section shows Security link in both locales
- Privacy/Terms links and `mailto:` report link work
- Mobile layout remains readable and unbroken

**Step 4: Final commit (only if follow-up fixes were needed)**

```bash
git add -A
git commit -m "fix(security): address QA follow-ups"
```
