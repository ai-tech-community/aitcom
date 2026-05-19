# Benchmark UX: hub landing, surface-first Contribute, About-anchored stats

**Status:** accepted
**Builds on:** [ADR-0006](0006-byoa-community-executes-ait-collects.md),
[ADR-0007](0007-byoa-trust-model.md),
[ADR-0008](0008-byoa-coverage-strategy.md)

The BYOA backend rebuild (Steps 1–6 of the 2026-05-18 BYOA plan)
landed without restructuring the UI. The page is still a flat tab
soup: Dashboard / Run / Submit, with a 24-prompt grid that shows 8
coverage chips per card, surfaces the same coverage data twice (chips
+ assignment panel), and never explains what the headline stats
mean. The whole benchmark reads as opaque to a first-time visitor.

This ADR pins the cross-cutting UX architecture that the redesign
will sequence. It is intentionally narrower than a full UI spec — it
captures only the choices that are hard to reverse (URL structure,
cross-page components) or surprising without context.

## Decisions

### 1. The page is a hub with three lanes on dedicated URLs

`/benchmark` becomes a small landing page: H1, tagline (community
framing — "Community-built benchmark of how AI products surface
brands"), a 2–3 sentence explainer, three big cards, and a thin
live-stats strip below the cards.

The cards each link to their own URL:

- `/benchmark/contribute` — contributor flow (today's Run tab,
  redesigned).
- `/benchmark/brands` — already exists; gains stat-explainer
  popovers and a "Help improve coverage" CTA when cells are thin.
- `/benchmark/about` — new long-form explainer.

The existing tab-based routes (`/benchmark?tab=run`, etc.) redirect
to their new URL for back-compat.

**Why:** the previous three-tab structure tried to serve four
personas (contributor, brand owner, researcher, power user) with one
flat layout, and lost all of them. Splitting by URL gives each lane
room to breathe, makes each page have a single primary job, and
mirrors the lanes in the site's IA so analytics, SEO, and
deep-linking all line up. The live-stats strip below the cards
("N runs this week · M contributors · K brands tracked") is the
minimal credibility signal a curious first-timer needs.

**Tradeoff accepted:** a new route layer to maintain, and a small
landing page that adds one click before contributors reach the
prompt list. The localStorage persistence of the contributor's
chosen surface (decision 2) means that click is one-time for repeat
visitors.

### 2. The Contribute lane is **surface-first**

`/benchmark/contribute` opens with a single prominent picker —
"Which AI are you running this in?" — that lets the contributor pick
one of the 8 `model_surface` values
([[adr-0001-brand-benchmark-primary-slice-keys]]). The choice
persists to **localStorage**; return visitors land directly on a
prompt list tailored to their surface, with a small "Running in:
ChatGPT+web · Change" chip in the header.

The page top-to-bottom is:

1. Surface picker / current-surface chip (in the header).
2. **Held assignments** block — floats up regardless of picked
   surface, since held work always overrides exploration.
3. **Quick-start CTA** — when an open assignment exists for the
   picked surface, a single "Grab 5 prompts that need ChatGPT+web"
   button. Materialises the picked surface's most-under-covered
   prompts as a held assignment in one click.
4. **Prompt list** — ordered by gap size on the picked surface,
   one card per prompt, **one coverage chip per card** (the chosen
   surface's status). Filters live above the list.
5. **My recent runs** — collapsed by default.

The prompt card keeps both submit buttons, but **hierarchy is
inverted**: "Submit a run" (manual paste) is the filled primary;
"Run with my agent" (MCP) is the outline secondary. The agent path
still opens today's AgentRunModal.

**Why:** the surface-first frame is the single biggest unintuitive-
ness fix. Under the old layout, every card showed 8 chips because
the layout didn't know what surface the contributor cared about.
Once we ask once and remember, the chip strip collapses to one chip,
the assignment panel and chips converge on the same picked surface,
and the dual-coverage-surfacing problem disappears. The held-
assignments-float rule keeps committed work visible even when the
contributor switches surfaces to explore. The button hierarchy
inversion matches BYOA reality: the canonical path is paste-from-
chat, not MCP-from-agent, and the buttons should say so.

**Tradeoff accepted:** localStorage means cross-device contributors
re-pick once per device. Acceptable until we have a clear need for
server-side prefs.

### 3. Stats are explained via a reusable `<StatLabel>` component anchored to /benchmark/about

Every stat label across the benchmark UI (Visibility, Share of
Voice, Avg rank, Sentiment, Citation rate, Coverage, Threshold,
Weight, etc.) is rendered through one component that displays the
label plus an info icon. The icon opens a popover containing:

- The plain-English definition (1–3 sentences).
- A one-line "Read more →" link to the relevant section of
  `/benchmark/about`.

Definitions live in a single TS module so the popover and the
About page share their source of truth. The About page is a single
long page with a sticky TOC: What this is · How runs become metrics
· Stats glossary · Why slice by (product, grounding) · How trust &
weighting work · How to contribute · FAQ. Tone is plain English for
contributors; each section ends with a "Full reasoning: ADR-XXXX"
link for engineers.

**Why:** the "stats are unclear" complaint is independent of layout
and applies everywhere stats are shown — brand profiles, the
Browse list, eventually anywhere we render benchmark numbers. A
shared component with a shared definition module is the only way to
keep the explanation consistent as the surface grows. Tooltips-only
were considered and rejected: bad on mobile, no link to depth.

### 4. Brands → Contribute funnel via a per-cell CTA

The brand profile (`/benchmark/brands/[slug]`) shows a "Help improve
coverage" card whenever any of the brand's prompts have under-
covered cells. The card lists the surfaces that need contributors
("Claude+web needs 2 more, Gemini+web needs 1") and links to
`/benchmark/contribute` with the surface and prompts pre-selected.

**Why:** brand-affiliated visitors are a real audience but landed
in a dead-end before — the brand profile is informational only.
This card is the only outbound CTA from the Brands lane back to
Contribute; the rest of the brand page stays purely informational
to preserve the analytical mode it serves well in.

## Consequences

- New routes: `/benchmark/contribute`, `/benchmark/about`. The
  existing `/benchmark` page is rewritten as a hub. Old
  `?tab=run`/`?tab=submit` URLs redirect.
- New reusable components: `<SurfacePicker>`, `<StatLabel>`, and a
  central `stat-definitions.ts` module. The existing
  `PromptCoverageStrip` collapses to a single-chip variant; the
  8-chip variant goes away.
- The existing tab-based `BenchmarkPage` becomes obsolete and is
  removed once the new hub ships.
- `RunPromptsTab` is split: the prompt-list code moves to the new
  Contribute route; the panel logic merges with the page layout
  (held + quick-start), no longer a self-contained component.
- localStorage key for surface preference (e.g.
  `ait.benchmark.surface`). Keep simple; no schema impact.
- The dashboard tab content is repointed: parts that belong to the
  Brands lane move under `/benchmark/brands`; methodology bits move
  to `/benchmark/about`.

## What this ADR does *not* settle

- Visual design specifics: colours, spacing, exact card sizes,
  iconography.
- The Contribute prompt-card's empty-state copy for surfaces with
  no eligible prompts (e.g. picked Kimi but Kimi has no
  Chinese-locale prompts available).
- Whether the hub's live-stats strip is global or per-locale.
- Server-side storage of the surface preference (deferred until
  cross-device experience is a real complaint).
- Whether held-assignment expiry warnings appear in the header or
  inline on the held block.
