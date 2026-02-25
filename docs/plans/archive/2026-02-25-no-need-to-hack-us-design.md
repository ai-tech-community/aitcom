# No Need to Hack Us Page Design

## Overview

Add a new public page with playful transparency messaging: "No need to hack us". The page should build trust across three audiences at once: curious visitors, security-minded engineers, and potential sponsors. Tone should be mostly friendly and clear, with selective nerdy jokes in headings and one-liners.

## Audience and Goals

### Primary audiences
- Curious visitors who want reassurance that the platform is run responsibly
- Engineers who want concrete signals that security hygiene exists
- Sponsors/partners who need confidence in operational maturity

### Success criteria
- Communicates stack and operational safeguards without exposing sensitive internals
- Matches existing AIT brand voice (direct, technical, community-oriented)
- Gives a clear responsible-disclosure path
- Feels memorable instead of generic legal copy

## Tone and Voice

- Tone split: about 70% friendly transparency, 30% nerdy humor
- Humor placement: headings and short callouts only; body text stays factual
- Safe humor examples:
  - "No need to hack us. We already show our stack."
  - "Please don't pentest the coffee machine."
  - "Transparent by default, boring where it matters."

## Information Disclosure Boundary

This page is intentionally transparent, but not exhaustive. We should publish:
- High-level stack categories (frameworks/providers)
- Security practices and operational controls at a policy level
- Vulnerability reporting process and response targets

We should not publish:
- Secrets, keys, tokens, or credential formats
- Internal network topology, admin endpoints, or detection thresholds
- Known exploit details or pending vulnerability specifics

## Page Structure

1. Hero
- H1: "No need to hack us."
- Supporting line: "We're transparent on purpose."
- Optional subcopy clarifying that transparency excludes secrets

2. What We Run
- Card grid with high-level categories:
  - Frontend/runtime
  - Auth and identity
  - Data and content
  - Infrastructure providers

3. How We Protect Members
- Checklist-style section with concise, non-marketing statements:
  - Access control and session handling
  - Input validation and server-side authorization
  - Abuse/rate controls
  - Logging and monitoring
  - Backup/recovery posture
  - Dependency patch routine

4. What We Don't Publish
- Short section setting boundaries and expectations

5. Found Something?
- Responsible disclosure callout:
  - Contact address
  - What to include in a report
  - Acknowledgement target (e.g. 48 hours)

6. Trust Links
- Privacy policy
- Terms
- Security contact/report link

## UX Notes

- Reuse existing static-page visual language (monospace headings, structured sections)
- Keep scanning easy: short paragraphs, bullets, clear heading hierarchy
- Include at least one high-contrast callout box for disclosure/reporting
- Mobile-first spacing and card stacking

## Content Blueprint (Approved)

### Hero
- "No need to hack us."
- "We're transparent on purpose."

### What we run
- Frontend: Next.js + TypeScript
- Auth: Better Auth + OAuth
- Data: Postgres/Drizzle + CMS
- Infra: hosting/email/payments providers (high-level names only)

### How we protect members
- Session security and access controls
- Input validation and server-side authorization
- Rate limiting and abuse controls
- Audit logging and monitoring
- Backups and recovery approach
- Dependency updates and patch routine

### What we don't disclose
- Secrets/tokens/internal keys
- Internal network topology
- Detailed exploit paths

### Report responsibly
- Security contact email
- Required report details
- Response target window

### Footer CTA links
- Read Privacy Policy
- Read Terms
- Report a Security Issue

## File-Level Design Impact

- Add new localized route page at `src/app/[locale]/security/page.tsx`
- Add new translation namespace in `messages/en.json` and `messages/nl.json` for page copy
- Add discoverability link in footer legal section (likely `src/components/footer.tsx`)
- Add metadata/alternates for SEO and i18n consistency

## Risks and Mitigations

- Risk: oversharing operational details
  - Mitigation: keep controls policy-level, no internal implementation specifics
- Risk: playful tone undermines credibility
  - Mitigation: reserve jokes for headers, keep control statements concrete
- Risk: stale stack/security statements
  - Mitigation: add "last updated" field and review cadence in content ops

## Out of Scope

- Public bug bounty program launch
- Detailed architecture diagrams
- Incident postmortem archive

## Rollout

- Soft launch via footer legal area first
- Optional later addition to navbar or trust banner based on analytics
