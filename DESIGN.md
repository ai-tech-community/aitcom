---
name: AIT Community
description: A town square where engineers and AI agents build together — warm and communal on a precise technical grid.
colors:
  signal-orange: "oklch(0.705 0.213 47.604)"
  ink: "oklch(0.145 0 0)"
  surface: "oklch(1 0 0)"
  surface-raised: "oklch(0.985 0 0)"
  surface-muted: "oklch(0.97 0 0)"
  text-strong: "oklch(0.205 0 0)"
  text-muted: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  success: "oklch(0.52 0.14 150)"
  warning: "oklch(0.54 0.13 85)"
  info: "oklch(0.55 0.16 240)"
  on-accent: "oklch(1 0 0)"
  chart-1: "oklch(0.646 0.222 41.116)"
  chart-2: "oklch(0.6 0.118 184.704)"
  chart-3: "oklch(0.398 0.07 227.392)"
  chart-4: "oklch(0.828 0.189 84.429)"
  chart-5: "oklch(0.769 0.188 70.08)"
  night-sky: "oklch(0.9 0.035 262)"
typography:
  display:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.05em"
  magazine-masthead:
    fontFamily: "Italiana, Georgia, serif"
    fontSize: "clamp(3.5rem, 11cqw, 11rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  magazine-bodoni:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "clamp(3rem, 6.5cqw, 6rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  magazine-cormorant:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(3rem, 6.5cqw, 6rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  magazine-reading:
    fontFamily: "Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  badge:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  section-label:
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
---

# Design System: AIT Community

## Overview

**Creative North Star: "The Town Square"**

AIT Community is a town square where engineers and AI agents gather to build together. The square is built on a precise technical grid — monospace labels, OKLCH tokens, ruled borders, an orange-dot wordmark — but the grid is the _pavement_, not the point. Warmth comes from the people, the imagery (the illustrated isometric town square, the village landscape), the language, and the disciplined use of a single warm accent. The system reads as _well-built and welcoming at the same time_: you can tell an engineer made this, and you can tell you're meant to belong here.

The system is **balanced**: one shared core of tokens, type, and components serves both the public square (home, communities directory, members leaderboard, blog, benchmark, impact) and the workshops behind it (dashboards, community settings, event and challenge workspaces, classroom). Public surfaces get more expressive latitude — bigger type, more imagery, more air — but they never invent a parallel system. App surfaces are information-dense by necessity, and they earn warmth through clear hierarchy and human copy, not by stripping function. A member should feel the same product whether they're on the homepage or three levels deep in an event workspace.

This system explicitly **rejects** four things. It is not a **generic SaaS template** (no cream/sand backgrounds, no gradient hero text, no hero-metric blocks, no endless identical icon+heading+text card grids). It is not a **cold, sterile dashboard** (density without coldness — never an all-gray enterprise admin panel). It is not **crypto/Web3 hype** (no neon-on-black, no aggressive gradients, no "to the moon" energy). And it is not **corporate or stuffy** (no stock photography, no navy-and-gray, no jargon).

**Key Characteristics:**

- Pure-white (or true-dark) canvas, never tinted warm-neutral cream.
- One warm accent — Signal Orange — used sparingly and on purpose.
- Geist Sans for everything human; Geist Mono reserved for the house `/ LABEL` voice, stats, and timestamps.
- Border-defined, flat-by-default surfaces with subtle lift on interaction.
- WCAG 2.2 AA, bilingual-tolerant (EN/NL), color-blind-safe, reduced-motion-aware.

## Colors

A near-monochrome canvas of true white through ink, lit by a single warm orange. The discipline of the neutral field is what makes the one accent carry meaning.

### Primary

- **Signal Orange** (`oklch(0.705 0.213 47.604)`): The one warm accent and the wordmark dot. It is a _wayfinding_ color — primary buttons, focus rings, active states, the rare "act here." In dark mode it deepens slightly to `oklch(0.646 0.222 41.116)` for comfort on a dark field. Rarity is the entire point; see the One Voice Rule.

### Neutral

- **Ink** (`oklch(0.145 0 0)`): Primary text on light surfaces; the dark-mode canvas. The default foreground.
- **Surface** (`oklch(1 0 0)`, pure white): The canvas and card background in light mode. Never a tinted cream.
- **Surface Raised** (`oklch(0.985 0 0)`): Sidebar and subtly distinguished panels.
- **Surface Muted** (`oklch(0.97 0 0)`): Secondary buttons, muted fills, hover beds, accent backgrounds. The quiet gray that does most of the structural work.
- **Text Strong** (`oklch(0.205 0 0)`): Secondary-button and high-emphasis-on-muted text.
- **Text Muted** (`oklch(0.556 0 0)`): Descriptions, captions, and the `/ LABEL` section markers. **Audit it for AA: 0.556 lightness on white clears 4.5:1, but never push muted text lighter than this on a white surface, and never use it for placeholder-as-body.**
- **Border** (`oklch(0.922 0 0)`): Hairline borders, dividers, input strokes. The ruled-grid feel comes from here.

### Tertiary (data only)

- **Charts 1–5** (`oklch(0.646 0.222 41.116)` orange, `oklch(0.6 0.118 184.704)` teal, `oklch(0.398 0.07 227.392)` deep blue, `oklch(0.828 0.189 84.429)` yellow, `oklch(0.769 0.188 70.08)` amber): Reserved for data visualization (Recharts) only. **Never** borrow chart colors into UI chrome — that's how a clean palette turns into confetti.
- **Heat 1–3** (`--heat-1/2/3`, a contained success-green intensity ramp light→mid→dark; brightened in dark mode): the one sanctioned heatmap ramp, used **only** by the hackathon team-heatmap (`cell-heat.ts`) to encode claimed → completed → verified as data intensity. A documented exception to the Chart-Containment Rule — like the chart hues, these tokens never appear in UI chrome.

- **Emblem hues** (`--emblem-hue-*`, with `--emblem-ink-l/-c` and `--emblem-tint-l/-c` per theme): one quiet hue per badge track, drawn only by `BadgeEmblem` (`src/components/badges/badge-emblem.tsx`). Each hue token is a bare OKLCH angle; the theme sets lightness and chroma (ink ≈ L 0.45 / C 0.075 on a tint ≈ L 0.96 / C 0.02 in light, ink L 0.84 on tint L 0.27 in dark), so a track keeps its hue in both themes and ink on tint stays ≥4.5:1. Hues 20–80 are never used, so no emblem reads as Signal Orange (One Voice Rule); milestones are neutral (no chroma). Shape and glyph carry a badge's identity, the hue is only a second cue (Pair-With-A-Cue). A documented exception to the Chart-Containment Rule, like the heat ramp: these tokens never appear in UI chrome. The chart tokens themselves are not used: there are five for eleven tracks, chart-1 is orange in light mode, and their hues change between themes.

### Illustration (the town square only)

- **Night Sky** (`--night-sky`, `bg-night-sky`; light `oklch(0.9 0.035 262)`, dark `oklch(0.25 0.05 264)`): the cool dusk tint behind the homepage town square's rooftops when a visitor turns night on. Cool blue-grey on purpose — never warm (No-Cream Rule), never orange (One Voice Rule). It fades in with the night level, only above the street and right of the hero copy's keep-clear zone, so it never sits under text. Lit windows and stars stay legible on it in both themes (ink on the light tint, near-white on the dark one). Like the chart hues, it never appears in UI chrome.

### Status (semantic — meaning, not decoration)

A fixed four-color vocabulary. Each is WCAG AA verified both as colored text on white (≥4.5:1) and as white-on-solid-fill, with brighter dark-mode tones (≥7:1 on the dark surface). Each has a paired `-foreground` token (white in light mode, near-black in dark) for solid fills. Available as Tailwind utilities: `bg-success`/`text-success`/`border-success` (and `warning`/`info`/`destructive`), plus the soft pattern `bg-success/15 text-success`.

- **Success** (`oklch(0.52 0.14 150)`): completed, verified, passed, healthy, online.
- **Warning** (`oklch(0.54 0.13 85)`): pending, at-risk, needs-attention, expiring. Pushed yellow-of-amber so it never reads as Signal Orange.
- **Info** (`oklch(0.55 0.16 240)`): informational, in-progress, neutral-notice.
- **Destructive** (`oklch(0.577 0.245 27.325)`): errors, destructive actions, failed, invalid-field rings. The only red in the system.

### Named Rules (status)

**The Semantic-Status Rule.** Status color comes only from these four tokens — never raw Tailwind palette classes (`text-green-600`, `bg-red-500`, `text-amber-600`) and never a hardcoded hex. If a state needs color, it maps to success/warning/info/destructive. Categorical things that are NOT a status (challenge difficulty, post type, tags) are NOT status colors — use neutral Badges whose label carries the meaning.

**The Pair-With-A-Cue Rule.** Status is never communicated by color alone (8% of men can't distinguish red/green). Every status color ships with an icon, label, or shape — a check for success, an alert glyph for warning, etc.

### Named Rules

**The One Voice Rule.** Signal Orange appears on ≤10% of any given screen. It marks the single most important action or the active state — nothing else. If two things on a screen are orange, one of them is wrong. When a screen's main actions are equal peers there is no single most important action: render them all as Ink buttons and spend no orange on them.

**The No-Cream Rule.** The body background is pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`). Never a warm-tinted near-white. The instant a surface drifts toward cream/sand/parchment, it reads as a generic AI-generated landing page — the exact anti-reference.

**The Chart-Containment Rule.** The five chart hues live inside data viz and nowhere else. UI chrome is neutral + Signal Orange, full stop. (Documented exceptions with their own tokens: the heat ramp and the emblem hues above.)

## Typography

**Display / Body Font:** Geist Sans (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Label / Mono Font:** Geist Mono (with `ui-monospace, monospace` fallback)

**Character:** One geometric-humanist sans does all the human-facing work across every weight; a single monospace carries the system's "machine voice." The contrast axis is sans-vs-mono, never two similar sans pitted against each other. The pairing reads modern, engineered, and unfussy.

### Hierarchy

- **Display** (600, `clamp(2rem, 5vw, 3.5rem)`, line-height 1.05, letter-spacing −0.02em): Hero and page-defining headlines on public surfaces only. Use `text-wrap: balance`. Ceiling is ~3.5rem — the square speaks, it doesn't shout.
- **Headline** (600, ~1.5rem, line-height 1.2): Section and card-group headings.
- **Title** (600, ~1rem, line-height 1, "leading-none font-semibold"): Card titles and compact headings.
- **Body** (400, 0.875–1rem, line-height 1.5): Default reading text. Cap measure at 65–75ch. On dense app surfaces, 0.875rem (`text-sm`); on reading surfaces (blog, descriptions), step up.
- **Label** (500, 0.75rem, letter-spacing 0.05em, Geist Mono): The signature `/ SECTION_NAME` marker, stat tickers, timestamps, and metadata. Often uppercase, always monospace, always `text-muted`.

### Magazine publication typography

Greg approved an editorial fashion-magazine direction and editor font selection on 29 October 2026. Magazine settings offer **Italiana** (default), **Bodoni Moda**, **Cormorant Garamond** and **Geist Sans**, loaded through `next/font` and served locally. The choice applies to the masthead, cover title, article title and issue story headings; controls remain Geist Sans and long-form prose uses Georgia. The setting is magazine-wide. Missing or unknown values resolve to Italiana. Settings show the selected face in a live preview.

Publication type may use 1.0625rem, 1.125rem, 1.25rem, 1.75rem, 2rem, 2.5rem, 2.75rem, 3rem, 3.5rem, 4.5rem, 5.5rem, 6rem and 11rem as fluid endpoints or reading sizes. These values and the cover's black scrim are intentional exceptions scoped to `src/styles/magazine.css`; they do not expand the global app hierarchy. Mastheads and titles wrap long real names instead of clipping. Text remains visible without motion.

### Decorative ASCII

Town-square and community scenes use a measured 10px monospace cell with 12px line-height on compact layouts, stepping to 12px/14px where the scene specifies it. The artwork is `aria-hidden`; names, descriptions, event details and controls remain accessible text. This is an intentional illustration size, not a body-text size. Scene minimum-row thresholds must fit the rendered height: the 64px mobile community strip uses `minRows={4}` and fits five 12px rows. Shared motion pauses off-screen and respects reduced motion.

### Named Rules

**The House Kicker Rule.** The monospace `/ LABEL` (e.g. `/ COMMUNITIES`, `/ MEMBERS`) is the one sanctioned eyebrow and it is a _system_, not decoration. Use it as a consistent section marker. Do not also sprinkle uppercase tracked eyebrows or `01 · 02 · 03` numbered markers on top of it — that's the AI-grammar tell. Numbers earn their place only when the section truly is an ordered sequence.

**The Mono-Is-Machine Rule.** Geist Mono is reserved for the machine voice: labels, code, stats, IDs, timestamps. Member bios, community descriptions, and any warm human copy are Geist Sans. Monospace everywhere is how the town square turns cold.

## Layout

### Page frame

- **Default:** pages sit in a centred `max-w-6xl` column with `px-6 sm:px-12` gutters, so every surface reads as one product.
- **Named exception — the Explore page (`/communities`):** the town-square street runs edge to edge, with the headline standing on its left, and the directory below it uses a wider `max-w-[1600px]` frame (`BODY_FRAME` in `communities/discover/explore-layout.ts`) with a sticky rooms side panel from `xl`. It is a showroom, not a tool page. Text never runs edge to edge: only the street does. Do not copy this frame to other pages without recording a new exception here.
- **Named exception — the member dashboard (`/dashboard` and its tabs):** the frame (`MemberDashboardFrame`: greeting and tabs, used by `dashboard/(member)/layout.tsx` with the side panel) runs full width on the top nav's `px-4 sm:px-8` gutters, so the main column and the 20rem side panel line up with the nav's edges. The panel sits beside the main column from `lg` (`grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]`, sticky, scrolling on its own when taller than the viewport) and stacks below it on smaller screens. The agent workspace (`/dashboard/agent`) and onboarding (`/dashboard/onboarding`) keep the default frame.
- **Named exception — the data collectors workspace (`/dashboard/collectors` and below):** the same `MemberDashboardFrame` without the side panel (`dashboard/(member-wide)/layout.tsx`), so the collector pages use the full width. Inside, one persistent left rail (`grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]`, sticky from `lg` and scrolling on its own when taller than the viewport, like the member side panel: `lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain`): the paste box, presets by group, "Custom page" last, "My runs". Below `lg` the rail's list becomes a compact disclosure picker above the content. The right side has one heading and no breadcrumbs or section kickers; the rail's active entry is ink, never orange (the Start run button keeps the one orange).
- **Named exception — the member profile (`/members/[id]` and its tabs):** the frame (`members/[id]/layout.tsx`) uses the dashboard's full-width `px-4 sm:px-8` gutters with the panel on the left: the identity panel (the page's one `h1`) beside the route tabs from `lg` (`grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]`, sticky, scrolling on its own when taller than the viewport) and stacked above the tabs as a compact header on smaller screens. Tabs: Overview, Badges, Activity, Work, and Agent when the viewer may see the agent page.
- **Named exception — a community's pages (`/communities/[slug]` and its tabs):** the frame (`communities/[slug]/_community-layout-client.tsx`) uses the same full-width `px-4 sm:px-8` gutters with a community rail on the left from `lg` (`grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]`, sticky, scrolling on its own when taller than the viewport). The rail holds the identity (`CommunityIdentity`: logo, the community name as `h1`, tagline, members, the join control) and every tab as a vertical list (`CommunityNav`); the active tab is ink on the secondary fill, never orange. Below `lg` the rail's wrapper drops out (`display: contents`), so the same identity and tab list render as a header row and a sticky, edge-to-edge tab bar above the page — each is rendered once, never twice for two screen sizes. On the Overview, the feed's side panel sits beside the feed from `xl` (`xl:grid-cols-[minmax(0,1fr)_20rem]`, sticky) and below it on narrower screens. Because the rail takes 20rem from `lg`, tab content that splits into columns does so on its own width with container queries (`@container` on the component's root, `@xl:`/`@3xl:`/`@4xl:` on the grid), never on the screen width — the course view, classroom and launchpad listings, past events, insights and the settings menu all follow this. Workspace routes (`lib/communities/layout-variant.ts`) keep no frame at all. The issue builder (`/communities/[slug]/magazine/issues/[issueId]/edit`) is the magazine's only workspace route; article review (`/communities/[slug]/magazine/review/[articleSlug]`), team (`/communities/[slug]/magazine/team`), moved settings (`/communities/[slug]/magazine/settings`) and automatic drafts (`/communities/[slug]/magazine/auto-draft`) render inside the community frame, each opening with a back link to the Magazine tab. Review keeps the article at `max-w-[72ch]` with Approve as its one orange action; the team page gives that emphasis to Add to the team. The old `/communities/[slug]/settings/magazine` route redirects to the moved settings page.
- **Named exception — the magazines home and shelf (`/magazines` and `/magazines/[magazine]`):** a wide `max-w-[1600px]` frame on the nav's `px-4 sm:px-8` gutters, a showroom like the Explore page: the featured issue beside the "Just published" list, then the shelf of magazines or issues. Text never runs edge to edge. "Read the issue" on the featured issue is the home's one orange action; the same card on a community's Magazine tab is ink, because there the community frame's Join is the orange action.
- **Named exception — the issue reading view (`/magazines/[magazine]/[issue]` and its articles), approved 29 October 2026:** a dedicated editorial publication shell (`MagazineShell`) replaces the site navbar, global footer and session overlays. Keep the pure-white/true-dark canvas and neutral controls. The compact publication header offers a community return, the magazine shelf and issue contents. The wide `max-width: 1600px` frame opens with an oversized masthead (up to 11rem), dateline and expansive cover. Uploaded cover images receive a black 50–85% readability scrim; missing covers use a typographic composition. The editor's note precedes contents and the existing item layout. Magazine information, subscriptions, past issues and sharing sit below the stories. On phones, contents and publication information stack. Article pages use a centered headline (up to 6rem), wide media and a `72ch` reading column with Georgia body copy at 1.125rem (1.0625rem on phones), line-height 1.9. The builder uses the same `IssueEditorialHero`, selected font and container-responsive styling in its inert preview. This is a publication-specific exception, not a new global site style.
- **Named exception — magazine subscription confirmation (`/[locale]/magazine-subscriptions/confirm`):** a narrow reading page (`max-w-lg px-4 py-16`) with one House Kicker, a heading and a border-defined panel. The ready state offers the confirmation button; subscribed, expired and invalid states explain the next step.
- **Automatic drafts editor screen:** groups use labelled fieldsets in the community frame; Save is the one orange action and "Make a draft now" uses `ink`. Appointed editors see read-only settings and can still make a draft. Results use `role="status"`; history uses Sans for people and Mono for dates and times. In the builder, Publish keeps the accent and "Stop the automatic publish" uses `outline`.
- **Auto-pick reasons are editor-only, Sans, one muted line.** Show them beneath picked items in the builder and suggestions in an empty "Add more" search. They never appear in reader payloads or reading views.
- **Magazine subscription controls:** Subscribe is never the accent on the shelf, issue reading view or community Magazine tab. It uses `ink`, then `outline` when subscribed; the page keeps its existing orange action.
- **Preview issue and article pages:** the join panel's button is the page's one orange action. Inline prompts beneath article openings use `outline`. The panel follows the community's join policy: join, ask to join, pending request, or an invitation explanation. Preview issues keep the cover, editor's note, contents and item cards; article openings contain at most 80 words of text, never code or images, and editorial bodies are withheld. Preview article pages keep the reading measure, opening and join panel, with no full body, article contents or comments. After joining or requesting membership, focus moves to the page heading before the page refreshes. The builder's inert visitor preview uses the same prompt presentation.
- **Issue layouts and item sizes:** `cover-story` keeps a full-width `lead` followed by the responsive grid of `card` items. `long-read` gives every item `lead` size in one column (`max-w-3xl`). `digest` is an ordered list of compact `row` items separated by hairlines. `related` is a compact recommendation after an article, with an excerpt for article items. Every item kind owns all four sizes; layouts only arrange them. Contents anchors follow item order in every layout. A preview article row shows its title and a muted "Members read the whole article" line; the join action stays in the panel. The builder layout picker and automatic-drafts settings offer all three layouts.
- **Issue item imagery:** any item kind may carry an optional issue-owned image with a landscape (3:2), portrait (3:4) or square (1:1) crop and a 0–100% focal point on each axis. The shared semantic figure supplies alt text, caption and credit. A custom lead image replaces its article's source image; removing it restores the original item presentation. Compact rows use a thumbnail beside the text. The same figure renders in the image editor and reader. Image upload and metadata controls follow the site's existing neutral form style. Publishing and autosave wait for uploads, including when an editor closes and reopens an item.
- **Magazine share controls:** Copy link, the device share sheet and social links are secondary controls, never orange. Members-only issues offer Copy link only. `ShareActions` takes a required absolute `url` from the server for every share action. X and LinkedIn links announce the new tab and use `rel="noopener noreferrer"`; email uses a normal `mailto:` link without a new tab or that announcement. Copy and share feedback uses only the `role="status"` line, with no toast.
- **Issue numbers page:** opens inside the community frame with a back link, one `<SectionLabel>` and a heading. Four flat stat groups use Sans labels and Mono numbers with tabular figures. The article table uses Sans titles and column labels, Mono counts, real column and row headers, wrapping text and hairline separators. The empty state explains when numbers appear; the muted note explains daily signed-out counts and excluded editor visits. The editor desk links published issues to Numbers; contributors cannot open the page.

### Homepage discovery (`/[locale]`)

The homepage uses the full available width with `px-6 sm:px-12` gutters. From `lg`, the discovery area is a twelve-column grid: communities take eight columns and news four, with the events agenda spanning the next row. If either communities or news is absent, the remaining discovery section spans all twelve columns.

The DOM and mobile reading order is communities, upcoming events, news, magazines, recent gatherings, sponsors, then the organizer prompt. Communities form a two-column gallery; with more than four cards, it becomes three columns at `xl`. The gallery stops at six communities, the news rail at four headlines and the magazine shelf at four magazines. Empty magazine, gathering and sponsor sections are omitted. These are homepage choices, not defaults for other surfaces.

The homepage hero retains the interactive ASCII town square in a shorter frame (`sm:min-h-[26rem] lg:min-h-[28rem]`). The detailed content, visibility and empty-state contract lives in `docs/superpowers/specs/2026-10-28-home-discovery-design.md`.

## Elevation & Depth

Flat by default. Surfaces are defined by hairline borders (`oklch(0.922 0 0)`) and tonal layering (surface → surface-raised → surface-muted), not by drop shadows. Shadows are present but minimal and almost entirely _functional_: they signal that something is interactive or floating, never decorate a resting surface.

### Shadow Vocabulary

- **Hairline lift** (`shadow-xs`): Buttons (outline variant) and inputs at rest — barely-there separation from the canvas.
- **Shared card** (`shadow-sm`): The shared `Card` primitive retains its subtle resting shadow and full border. Compact homepage community cards and magazine covers are border-defined without a resting shadow.
- **Floating** (default popover/dropdown/dialog shadow): Reserved for genuinely floating layers (popovers, dropdown menus, dialogs, toasts) that escape the document flow.

### Named Rules

**The Flat-By-Default Rule.** A resting surface is border-defined and nearly flat. Reach for a heavier shadow only when an element is _floating_ (overlay) or _responding_ (hover/active). If a static card has a big soft shadow, it's wrong — that's the 2014-app tell.

**The Border-Carries-Depth Rule.** Depth is communicated by borders and tonal steps first, shadow second. Removing every shadow should still leave the hierarchy legible.

## Shapes

The root radius is 10px (`--radius: 0.625rem`): `rounded-sm` resolves to 6px, `rounded-md` to 8px, `rounded-lg` to 10px and `rounded-xl` to 14px. Buttons and fields use the 8px step; shared cards use 14px. Pills belong to badges and compact controls. Full hairline borders define card and input surfaces; rounded clipping keeps decorative artwork within its own container.

## Components

The feel across all components is **precise and quietly warm**: clean, grid-aligned, confident, with warmth coming through clarity and restraint rather than ornament. All interactive components share one focus treatment — a 3px Signal-Orange ring at 50% (`focus-visible:ring-ring/50 ring-[3px]`) plus a border shift — and one invalid treatment (destructive ring + border).

### Buttons

- **Shape:** Gently rounded (`rounded-md`, 8px). Default height 36px (`h-9`), with `xs/sm/lg` and square `icon` sizes.
- **Primary:** Signal Orange fill, white text (`bg-primary text-primary-foreground`), padding 8px 16px. Hover darkens to 90% (`hover:bg-primary/90`).
- **Ink** (`variant="ink"`): solid foreground fill, background-coloured text (`bg-foreground text-background`, hover to 85%); inverts in dark mode automatically. Use it when a surface offers **two or more equal-weight paths** and none of them is _the_ single most important action — e.g. the homepage hero's "Explore communities" (members) and "Host your community" (organizers), which the product treats as equal ways in. Ranking one of them orange would tell half the audience they are secondary. Rule of thumb: one clear next step → **Primary**; several peer paths → all **Ink**, same size; never mix one Primary with Ink peers in the same group.
- **Secondary:** Surface-muted fill, strong-text (`bg-secondary`), hover to 80%.
- **Outline:** White background, hairline border, `shadow-xs`; hover fills with `accent` (surface-muted) and accent-foreground.
- **Ghost:** No fill at rest; hover fills with `accent`. For low-emphasis and icon actions.
- **Link:** Signal-Orange text, underline-on-hover with 4px offset.
- **Transitions:** `transition-all`; disabled drops to 50% opacity and blocks pointer events.

### Cards / Containers

- **Corner Style:** `rounded-xl` (14px) — slightly softer than buttons, the warm-communal touch.
- **Background:** Surface (white) on Ink-foreground.
- **Border:** Always a full hairline border. **Never** a colored side-stripe (`border-left`/`border-right` accent) — that's a banned pattern.
- **Shadow:** The shared `Card` primitive uses `shadow-sm`; compact homepage discovery cards omit it. See Elevation & Depth. Nested cards are forbidden.
- **Internal Padding:** 24px (`py-6`/`px-6`), 24px gap between sections (`gap-6`). Header uses a `@container` grid with an optional right-aligned action slot.

### Inputs / Fields

- **Style:** Transparent/white background, hairline `border-input`, `rounded-md`, `shadow-xs`, height 36px, padding 4px 12px.
- **Focus:** Border shifts to Signal Orange + 3px ring at 50% (`focus-visible:border-ring focus-visible:ring-ring/50 ring-[3px]`).
- **Error:** `aria-invalid` → destructive border + destructive ring. Placeholder uses `text-muted-foreground` — never lighter.
- **Disabled:** 50% opacity, `cursor-not-allowed`.

### Badges

- **Shape:** Pill (`rounded-full`), 0.75rem, font-medium, padding 2px 8px, optional 12px leading icon.
- **Variants:** Default (Signal Orange fill), Secondary (muted), Destructive, **Success / Warning / Info** (soft status pills — `bg-{token}/15 text-{token}`, built on the semantic status tokens), Outline (bordered, transparent), Ghost, Link.
- **Status vs. category:** use `success`/`warning`/`info`/`destructive` for _states_; use `secondary` (neutral) for _categories_ (difficulty, type, tags) and let the label carry the meaning.

### Badge emblems

- **One component:** `BadgeEmblem` draws every earned badge, award and (owner-only) locked badge in code from catalog data — never a trophy icon, image or pill. Sizes `sm` 24px (compact rows: dashboard You card, `/members` roster, other tiers), `md` 48px (milestones, limited editions, awards on the Badges tab), `lg` 96px (a track's highest tier, the Overview showcase). Stroke weights are set per size in screen pixels, so each size is drawn crisp rather than scaled; the tier III pattern is dropped at `sm`.
- **Silhouette per track:** Regular ticket, Host arch, Challenger shield, Writer dog-eared page, Builder hexagon, Learner pentagon, Teacher octagon, Connector quatrefoil, Agent wrangler rounded square, Benchmarker diamond, Streak drop. Milestones share a plain circle, the limited edition is a rosette, awards are a medal on a ribbon. Glyphs are lucide line icons, one per track.
- **Tier ring:** I a hairline outline, II a double hairline, III a solid band in the track's ink with a fine dotted pattern. The silhouette never changes with the tier.
- **Flat:** emblems carry no shadow. The limited edition's sheen is the one motion: it sweeps across on hover, and under `prefers-reduced-motion` rests as a static highlight.
- **The earning moment:** `BadgeCelebration` (mounted once in the session chrome) shows a member's unseen badges one at a time in a dialog, with one authored entrance: the `lg` emblem arrives (`animate-emblem-arrive`) and a ring in the badge's ink is drawn once around it (`animate-emblem-ring`), both only behind `motion-safe:`, so under reduced motion the emblem and ring are simply there. "Show on my profile" is the dialog's one primary action; Share and See badges are outline. A badge's share page (`/members/[id]/badges/[slug]`) sits in the profile frame, and its Open Graph image draws the same `BadgeEmblem` with literal dark-theme colours (`emblemPalette`).
- **Locked (owner only):** an outline in `muted-foreground`, no fill, with progress to that tier traced along the outline in `foreground` from the top. Visitors never see locked badges.
- **Accessible name:** "Writer, tier II, earned March 3, 2026" / "Writer, tier III, locked, 3 of 15" / "Writer, tier I, being added" when the metric already meets a tier the engine has not recorded yet (progress never reads "12 of 1"). EN and NL, locale dates, built by `useEmblemLabel()` and passed as `label`; leave `label` out only where adjacent text already says all of it.
- **Server-rendered:** `BadgeEmblem` has no client hooks, so lists like the `/members` roster hydrate nothing; only the limited-edition sheen (`EmblemSheen`, needs `useId`) is a client child.

### Homepage discovery cards and magazine covers

Community cards have full borders, 14px corners, 12px padding on phones and 16px from `sm`, real logos or initials, a two-line name/description and a real member count. Decorative strips are 64px on phones and 96px from `sm`. Hover changes border/background; keyboard focus has a visible ring.

Magazine tiles link directly to the newest discoverable issue for each magazine. Uploaded covers keep a 3:4 shape; missing covers are typeset from the real magazine name, issue number and issue title. The issue date, title and community remain visible outside decorative cover art. Preserve reading access through the shared server read model.

### Navigation

- **Style:** Quiet by default — Geist Sans or the mono `/ LABEL` for context nav, `text-muted` at rest, Ink/Signal-Orange on active. Hover is a subtle `bg-secondary/50` bed, never an aggressive fill.
- **Active state:** Carried by Signal Orange + weight, plus a non-color cue (underline or marker) so it's color-blind-safe.
- **Overflow:** Dropdowns/menus must use native `<dialog>`/popover or a portal — never `position:absolute` inside an `overflow:hidden`/`auto` container, or they clip.

### Section Label (signature)

The house kicker, now a shared primitive: `<SectionLabel>` (`src/components/ui/section-label.tsx`). Renders a monospace, muted, ruled marker with a leading `/ ` — e.g. `<SectionLabel>Communities</SectionLabel>` → `/ COMMUNITIES`. Props: `as` (element), `bordered`, `marker`. **Always use this instead of re-typing `font-mono text-xs tracking-wider text-muted-foreground`.** The single most recognizable element of the system — only as a real section divider.

### Storyline timeline and evidence

A reading pattern in `src/components/news/storyline-reader.tsx`, using the existing page frame and neutral tokens rather than a separate visual theme.

- **Chronology:** an ordered list with a neutral hairline rail, outlined circular markers, and ruled entries. Dates and latest-entry metadata use Geist Mono; article titles, editorial context, and explanations use Geist Sans. Undated coverage is separated from the dated sequence.
- **Reading measure:** narrative sections use a narrower column within the default page frame; the timeline stays single-column on mobile and desktop. Story index rows put metadata alongside the narrative from the small breakpoint and below it on smaller screens.
- **Evidence:** native disclosure controls reveal source excerpts and connection explanations on demand. Source links are underlined; disclosure controls use the existing focus ring and underline on hover where implemented. The rail and quote borders carry structure, not an accent stripe.
- **Continuity:** the header provides the latest update and an anchor to its timeline entry. Related stories remain flat, divided rows. No graph, elevated card stack, extra accent palette, or animation is introduced by this pattern.
- **Shared controls:** story search and staff editing reuse the existing Button, Input, Textarea, confirmation, and loading/empty/error primitives. Missing Dutch editorial text is identified explicitly alongside its English fallback.

### Shared primitives (use, don't reinvent)

The consistency debt was largely hand-rolled re-implementations. Reach for these:

- **`<SegmentedControl>`** (`ui/segmented-control.tsx`) — accessible radio-backed toggle (keyboard + SR for free). Replaces bespoke pill-button pairs.
- **`<RelativeTime date>`** (`ui/relative-time.tsx`) — localized "2 hours ago" via next-intl. Replaces hand-rolled `timeAgo()` (was English-only).
- **`<Avatar>` + `getInitials()`** (`ui/avatar.tsx`, `lib/avatar.ts`) — never re-derive initials inline.
- **`<Progress indicatorClassName>`** (`ui/progress.tsx`) — pass `bg-success` for a completed bar; never hand-roll a `<div>` bar.
- **`<Skeleton>` / `<EmptyState>` / `<ErrorState>`** (`ui/skeleton.tsx`, `ui/empty-state.tsx`, `ui/error-state.tsx`) — the three data states. Skeletons (not spinners) for loading; an EmptyState that teaches a next action (not "nothing here"); an ErrorState with retry for failed fetches.
- **`useRequireAuth()`** (`auth/auth-required-dialog.tsx`) — the one guest-gate for actions. `requireAuth(action, intent)` runs the action if signed in, else opens the branded sign-in/sign-up dialog; `promptAuth(intent)` opens it imperatively. The dialog preserves the current page so sign-in returns the user where they were (see `lib/auth-redirect.ts`).

### Named Rule (auth gating)

**The Gate-Before-Fail Rule.** A guest must never click an enabled control that then fails. Pick the gate by surface:

- **Member-only _pages_** → hard gate: server `getSession()` → `redirect("/auth/signin?redirect=<path>")` (mirror `dashboard/layout.tsx`, `blog/write`). Never render a member-only form and let it fail on submit.
- **Primary _actions_** (enroll, register, post, submit, vote-as-button, create) → soft gate: wrap in `requireAuth(() => mutate(...), "Sign in to …")`. Never call `.mutate()` directly from a guest-reachable handler.
- **Inline icon actions** (vote arrows, single-glyph toggles) → the one sanctioned exception: render `disabled` with a `title="Sign in to …"` tooltip. Use only here, not for primary actions.

`protectedProcedure` is the server backstop, not the UX — relying on it alone produces a raw `UNAUTHORIZED` toast, a silent no-op, or a doomed half-filled form. Banned guest treatments: silent `onClick` early-return, static non-clickable "log in to…" text, raw `error.message` rendered to the user, and ungated `.mutate()`.

### Named Rule (data states)

**The No-Silent-Failure Rule.** Every data fetch handles three states explicitly: loading → `<Skeleton>`; error → `<ErrorState onRetry>` (or hide, for purely supplementary widgets); empty → `<EmptyState>` (or hide). **Never** `if (!data) return null` as the only branch — a failed load must be distinguishable from "nothing here." Errored core sections show the error + retry; only optional/supplementary widgets may stay quietly absent.

## Do's and Don'ts

### Do:

- **Do** keep the body background pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`). Carry warmth through copy, imagery, and the accent — never a tinted cream surface.
- **Do** ration Signal Orange to ≤10% of a screen (the One Voice Rule). At most one primary action, one active state; equal peer actions use the Ink button instead.
- **Do** use the monospace `/ LABEL` as the one consistent section marker, and only there.
- **Do** define surfaces with full hairline borders and tonal layering; reserve shadows for floating or responding elements.
- **Do** pair every status color with a non-color cue (icon, label, pattern) — leaderboards, validation, charts, agent-vs-human.
- **Do** express all status color through the four semantic tokens (`success`/`warning`/`info`/`destructive`) — use `bg-success/15 text-success` for soft badges, `bg-success text-success-foreground` for solid fills.
- **Do** test headings and labels in both English and Dutch; layouts must absorb longer NL strings without overflow.
- **Do** give every Framer Motion animation a `prefers-reduced-motion` fallback, and ensure reveals enhance already-visible content rather than gating it.
- **Do** keep body text ≥4.5:1 (large ≥3:1); never push `text-muted` lighter than `oklch(0.556 0 0)` on white.

### Don't:

- **Don't** ship a **generic SaaS template** look: no cream/sand backgrounds, gradient hero text (`background-clip:text`), hero-metric blocks, or endless identical icon+heading+text card grids.
- **Don't** let app surfaces become a **cold, sterile dashboard** — density is fine, all-gray soulless admin panels are not.
- **Don't** drift toward **crypto/Web3 hype**: no neon-on-black, aggressive gradients, or "to the moon" energy.
- **Don't** go **corporate/stuffy**: no stock photography, navy-and-gray palettes, or jargon-heavy copy.
- **Don't** use a colored `border-left`/`border-right` stripe (>1px) as an accent on cards, list items, or alerts. Use full borders, background tints, or leading icons.
- **Don't** nest cards, and don't give resting cards heavy soft shadows.
- **Don't** stack extra eyebrows or `01 / 02 / 03` numbered markers on top of the `/ LABEL` system.
- **Don't** spend Geist Mono on warm human copy (bios, community descriptions) — that's how the square turns cold.
- **Don't** borrow chart colors into UI chrome.
- **Don't** use raw Tailwind palette classes (`text-green-600`, `bg-red-500/15`, `text-amber-600`, `text-zinc-400`) or hardcoded hex for status — map to `success`/`warning`/`info`/`destructive`. (~1,170 of these exist today; they are the consistency debt being retired.)
- **Don't** color a categorical attribute (challenge difficulty, post type, tags) as if it were a status — use a neutral Badge whose label carries the meaning.
