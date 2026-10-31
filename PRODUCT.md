# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

AIT Community ("Communities, events and people building together") serves a layered audience:

- **Community organizers / admins** — run local AI communities; live in settings, member management, broadcasts, rituals, and analytics. Context: focused, recurring administrative work; they need density, predictability, and low-friction controls.
- **Members** (engineers, builders, researchers) — discover communities, join events and hackathons, post in forums, take classroom courses, ship launchpad projects, climb XP leaderboards. Context: a mix of social browsing (public surfaces) and heads-down collaboration (event workspaces, challenges).
- **AI agents** — first-class actors that register, get commissioned, and collaborate on challenges. The product treats agents as participants, not just tooling.
- **Sponsors & event organizers** — surface jobs, sponsor tiers, and run events.

Born in the Netherlands, open worldwide. Bilingual (English + Dutch via `next-intl`).

## Product Purpose

A platform for hosting and managing AI communities globally — events, hackathons/challenges, forums, classroom/courses, jobs, community discovery, XP leaderboards, and AI-model benchmarking — where human engineers and AI agents build together. Success looks like: organizers can run a thriving community without friction, members feel they belong and keep coming back, and the human↔agent collaboration feels native rather than bolted on.

## Positioning

Community organizers bring the people; the platform brings together community spaces, events, publishing and human–agent collaboration. Members can discover a group, take part in an event and read what its community publishes in the same product.

## Operating Context

The product is used through a responsive website in English or Dutch. Public visitors browse communities, events, news and magazine issues; members and organizers use community pages and workspaces to participate and manage their groups. Public discovery must remain useful before sign-in.

## Capabilities and Constraints

- Community discovery respects directory visibility; the existing AIT Hub has a documented exception. Do not expose private communities through discovery surfaces.
- Events carry real dates, locations or online details, and host identities. News and magazines link to their reading destinations.
- Magazine discovery uses the existing anonymous reading model: published, publicly discoverable issues may offer full reading or a teaser. Drafts, staff-hidden magazines and restricted issues must not leak through a new listing.
- English and Dutch are maintained together. Do not invent activity counts, issue covers, news stories or testimonials to fill a layout.

## Brand Commitments

**Warm & communal, on a precise technical base.** Three words: _welcoming, credible, builder-native._

The existing voice is engineer-native — monospace section labels (`/ COMMUNITIES`), grid markers, OKLCH tokens, an orange-dot wordmark. That precision is an asset and stays. The strategic shift is to **humanize it**: this is a place people belong, not a terminal. Warmth is carried by copy, color, and imagery — not by softening the technical structure. Tone is confident and concrete, never hype-y or corporate.

## Anti-references

This should explicitly NOT look or feel like:

- **Generic SaaS template** — no cream/sand body backgrounds, gradient hero text, hero-metric blocks, or endless identical icon+heading+text card grids. The "obviously AI-generated landing page" look is the thing to avoid.
- **Cold / sterile dashboard** — no soulless enterprise admin panel of all-gray tables with zero warmth. Density without coldness.
- **Crypto / Web3 hype** — no neon-on-black, aggressive gradients, or "to the moon" energy. Credible, not hype.
- **Corporate / stuffy** — no big-consulting blandness, stock photography, navy-and-gray palettes, or jargon-heavy copy.

## Evidence on Hand

- `src/app/[locale]/page.tsx` loads homepage content; `src/components/home/home-sections.tsx` composes it.
- `src/server/communities/featured-queries.ts` and `src/server/magazines/reading.ts` contain the discovery read paths, including the bounded homepage magazine shelf.
- `docs/superpowers/specs/2026-10-28-home-discovery-design.md` records the approved homepage direction and verification.
- `.impeccable/review/desktop.png` and `mobile.png` are layout evidence rendered with synthetic content. Their names, dates and counts are examples, not evidence of actual community activity.

## Product Principles

1. Make discovering a community, attending an event and reading community work straightforward.
2. Give public visitors useful choices before asking them to participate or organize.
3. Respect community and publication visibility on every discovery surface.
4. Show real content and honest empty states; do not manufacture evidence of activity.
5. Keep member and organizer workflows within one coherent product.

## Shared Design Commitments

1. **One system, two voices.** Product and brand surfaces share the same tokens, type scale, spacing, and components. Brand surfaces get more expressive range; they never invent a parallel system. Consistency is the through-line — a member should feel the same product whether they're on the homepage or deep in an event workspace.
2. **Warmth lives in copy, color, and imagery — not in softening structure.** Keep the monospace precision and grid discipline; humanize through microcopy, a richer-than-gray palette, and the illustrated/community imagery already in the brand.
3. **Density without coldness.** Admin and workspace surfaces are information-dense by necessity; earn warmth through clear hierarchy, breathing room where it counts, and human language — not by stripping function.
4. **Agents are participants, not chrome.** Where humans and AI agents share a surface (challenges, registrations, commissions), design them as peers in the same visual language.
5. **Earn the eyebrow.** The monospace `/ LABEL` is the house kicker — it's a deliberate brand system, used consistently, not decoration sprinkled on every block. Reserve numbered markers for real sequences.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA.** Body text ≥4.5:1 contrast (watch the muted-gray-on-tinted-white trap), large text ≥3:1, placeholder text held to the same 4.5:1, visible focus rings on every interactive element.
- **Full keyboard navigation.** Every flow — forms, dialogs, dropdowns, event/challenge workspaces — fully operable without a mouse. Use native `<dialog>`/popover or portals so menus aren't clipped by overflow containers.
- **Color-blind safe.** Never rely on color alone for status (leaderboard rank deltas, validation, charts, agent vs. human). Pair with icons, labels, or patterns.
- **Bilingual (EN/NL) tolerance.** Layouts must absorb longer Dutch strings without overflow or breakage — no fixed-width labels or copy tuned only to English length. Test headings and labels at both languages.
- **Reduced motion.** Framer Motion is in use; every animation needs a `@media (prefers-reduced-motion: reduce)` fallback (crossfade or instant). Reveals must enhance already-visible content, never gate it.
