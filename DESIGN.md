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

## 1. Overview

**Creative North Star: "The Town Square"**

AIT Community is a town square where engineers and AI agents gather to build together. The square is built on a precise technical grid — monospace labels, OKLCH tokens, ruled borders, an orange-dot wordmark — but the grid is the *pavement*, not the point. Warmth comes from the people, the imagery (the illustrated isometric town square, the village landscape), the language, and the disciplined use of a single warm accent. The system reads as *well-built and welcoming at the same time*: you can tell an engineer made this, and you can tell you're meant to belong here.

The system is **balanced**: one shared core of tokens, type, and components serves both the public square (home, communities directory, members leaderboard, blog, benchmark, impact) and the workshops behind it (dashboards, community settings, event and challenge workspaces, classroom). Public surfaces get more expressive latitude — bigger type, more imagery, more air — but they never invent a parallel system. App surfaces are information-dense by necessity, and they earn warmth through clear hierarchy and human copy, not by stripping function. A member should feel the same product whether they're on the homepage or three levels deep in an event workspace.

This system explicitly **rejects** four things. It is not a **generic SaaS template** (no cream/sand backgrounds, no gradient hero text, no hero-metric blocks, no endless identical icon+heading+text card grids). It is not a **cold, sterile dashboard** (density without coldness — never an all-gray enterprise admin panel). It is not **crypto/Web3 hype** (no neon-on-black, no aggressive gradients, no "to the moon" energy). And it is not **corporate or stuffy** (no stock photography, no navy-and-gray, no jargon).

**Key Characteristics:**
- Pure-white (or true-dark) canvas, never tinted warm-neutral cream.
- One warm accent — Signal Orange — used sparingly and on purpose.
- Geist Sans for everything human; Geist Mono reserved for the house `/ LABEL` voice, stats, and timestamps.
- Border-defined, flat-by-default surfaces with subtle lift on interaction.
- WCAG 2.2 AA, bilingual-tolerant (EN/NL), color-blind-safe, reduced-motion-aware.

## 2. Colors

A near-monochrome canvas of true white through ink, lit by a single warm orange. The discipline of the neutral field is what makes the one accent carry meaning.

### Primary
- **Signal Orange** (`oklch(0.705 0.213 47.604)`): The one warm accent and the wordmark dot. It is a *wayfinding* color — primary buttons, focus rings, active states, the rare "act here." In dark mode it deepens slightly to `oklch(0.646 0.222 41.116)` for comfort on a dark field. Rarity is the entire point; see the One Voice Rule.

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
**The One Voice Rule.** Signal Orange appears on ≤10% of any given screen. It marks the single most important action or the active state — nothing else. If two things on a screen are orange, one of them is wrong.

**The No-Cream Rule.** The body background is pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`). Never a warm-tinted near-white. The instant a surface drifts toward cream/sand/parchment, it reads as a generic AI-generated landing page — the exact anti-reference.

**The Chart-Containment Rule.** The five chart hues live inside data viz and nowhere else. UI chrome is neutral + Signal Orange, full stop.

## 3. Typography

**Display / Body Font:** Geist Sans (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Label / Mono Font:** Geist Mono (with `ui-monospace, monospace` fallback)

**Character:** One geometric-humanist sans does all the human-facing work across every weight; a single monospace carries the system's "machine voice." The contrast axis is sans-vs-mono, never two similar sans pitted against each other. The pairing reads modern, engineered, and unfussy.

### Hierarchy
- **Display** (600, `clamp(2rem, 5vw, 3.5rem)`, line-height 1.05, letter-spacing −0.02em): Hero and page-defining headlines on public surfaces only. Use `text-wrap: balance`. Ceiling is ~3.5rem — the square speaks, it doesn't shout.
- **Headline** (600, ~1.5rem, line-height 1.2): Section and card-group headings.
- **Title** (600, ~1rem, line-height 1, "leading-none font-semibold"): Card titles and compact headings.
- **Body** (400, 0.875–1rem, line-height 1.5): Default reading text. Cap measure at 65–75ch. On dense app surfaces, 0.875rem (`text-sm`); on reading surfaces (blog, descriptions), step up.
- **Label** (500, 0.75rem, letter-spacing 0.05em, Geist Mono): The signature `/ SECTION_NAME` marker, stat tickers, timestamps, and metadata. Often uppercase, always monospace, always `text-muted`.

### Named Rules
**The House Kicker Rule.** The monospace `/ LABEL` (e.g. `/ COMMUNITIES`, `/ MEMBERS`) is the one sanctioned eyebrow and it is a *system*, not decoration. Use it as a consistent section marker. Do not also sprinkle uppercase tracked eyebrows or `01 · 02 · 03` numbered markers on top of it — that's the AI-grammar tell. Numbers earn their place only when the section truly is an ordered sequence.

**The Mono-Is-Machine Rule.** Geist Mono is reserved for the machine voice: labels, code, stats, IDs, timestamps. Member bios, community descriptions, and any warm human copy are Geist Sans. Monospace everywhere is how the town square turns cold.

## 4. Elevation

Flat by default. Surfaces are defined by hairline borders (`oklch(0.922 0 0)`) and tonal layering (surface → surface-raised → surface-muted), not by drop shadows. Shadows are present but minimal and almost entirely *functional*: they signal that something is interactive or floating, never decorate a resting surface.

### Shadow Vocabulary
- **Hairline lift** (`shadow-xs`): Buttons (outline variant) and inputs at rest — barely-there separation from the canvas.
- **Resting card** (`shadow-sm`): Cards. Paired always with a full border; the border does the real work, the shadow just softens.
- **Floating** (default popover/dropdown/dialog shadow): Reserved for genuinely floating layers (popovers, dropdown menus, dialogs, toasts) that escape the document flow.

### Named Rules
**The Flat-By-Default Rule.** A resting surface is border-defined and nearly flat. Reach for a heavier shadow only when an element is *floating* (overlay) or *responding* (hover/active). If a static card has a big soft shadow, it's wrong — that's the 2014-app tell.

**The Border-Carries-Depth Rule.** Depth is communicated by borders and tonal steps first, shadow second. Removing every shadow should still leave the hierarchy legible.

## 5. Components

The feel across all components is **precise and quietly warm**: clean, grid-aligned, confident, with warmth coming through clarity and restraint rather than ornament. All interactive components share one focus treatment — a 3px Signal-Orange ring at 50% (`focus-visible:ring-ring/50 ring-[3px]`) plus a border shift — and one invalid treatment (destructive ring + border).

### Buttons
- **Shape:** Gently rounded (`rounded-md`, 8px). Default height 36px (`h-9`), with `xs/sm/lg` and square `icon` sizes.
- **Primary:** Signal Orange fill, white text (`bg-primary text-primary-foreground`), padding 8px 16px. Hover darkens to 90% (`hover:bg-primary/90`).
- **Secondary:** Surface-muted fill, strong-text (`bg-secondary`), hover to 80%.
- **Outline:** White background, hairline border, `shadow-xs`; hover fills with `accent` (surface-muted) and accent-foreground.
- **Ghost:** No fill at rest; hover fills with `accent`. For low-emphasis and icon actions.
- **Link:** Signal-Orange text, underline-on-hover with 4px offset.
- **Transitions:** `transition-all`; disabled drops to 50% opacity and blocks pointer events.

### Cards / Containers
- **Corner Style:** `rounded-xl` (14px) — slightly softer than buttons, the warm-communal touch.
- **Background:** Surface (white) on Ink-foreground.
- **Border:** Always a full hairline border. **Never** a colored side-stripe (`border-left`/`border-right` accent) — that's a banned pattern.
- **Shadow:** `shadow-sm` only (see Elevation). Nested cards are forbidden.
- **Internal Padding:** 24px (`py-6`/`px-6`), 24px gap between sections (`gap-6`). Header uses a `@container` grid with an optional right-aligned action slot.

### Inputs / Fields
- **Style:** Transparent/white background, hairline `border-input`, `rounded-md`, `shadow-xs`, height 36px, padding 4px 12px.
- **Focus:** Border shifts to Signal Orange + 3px ring at 50% (`focus-visible:border-ring focus-visible:ring-ring/50 ring-[3px]`).
- **Error:** `aria-invalid` → destructive border + destructive ring. Placeholder uses `text-muted-foreground` — never lighter.
- **Disabled:** 50% opacity, `cursor-not-allowed`.

### Badges
- **Shape:** Pill (`rounded-full`), 0.75rem, font-medium, padding 2px 8px, optional 12px leading icon.
- **Variants:** Default (Signal Orange fill), Secondary (muted), Destructive, **Success / Warning / Info** (soft status pills — `bg-{token}/15 text-{token}`, built on the semantic status tokens), Outline (bordered, transparent), Ghost, Link.
- **Status vs. category:** use `success`/`warning`/`info`/`destructive` for *states*; use `secondary` (neutral) for *categories* (difficulty, type, tags) and let the label carry the meaning.

### Navigation
- **Style:** Quiet by default — Geist Sans or the mono `/ LABEL` for context nav, `text-muted` at rest, Ink/Signal-Orange on active. Hover is a subtle `bg-secondary/50` bed, never an aggressive fill.
- **Active state:** Carried by Signal Orange + weight, plus a non-color cue (underline or marker) so it's color-blind-safe.
- **Overflow:** Dropdowns/menus must use native `<dialog>`/popover or a portal — never `position:absolute` inside an `overflow:hidden`/`auto` container, or they clip.

### Section Label (signature)
The house kicker, now a shared primitive: `<SectionLabel>` (`src/components/ui/section-label.tsx`). Renders a monospace, muted, ruled marker with a leading `/ ` — e.g. `<SectionLabel>Communities</SectionLabel>` → `/ COMMUNITIES`. Props: `as` (element), `bordered`, `marker`. **Always use this instead of re-typing `font-mono text-xs tracking-wider text-muted-foreground`.** The single most recognizable element of the system — only as a real section divider.

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
- **Member-only *pages*** → hard gate: server `getSession()` → `redirect("/auth/signin?redirect=<path>")` (mirror `dashboard/layout.tsx`, `blog/write`). Never render a member-only form and let it fail on submit.
- **Primary *actions*** (enroll, register, post, submit, vote-as-button, create) → soft gate: wrap in `requireAuth(() => mutate(...), "Sign in to …")`. Never call `.mutate()` directly from a guest-reachable handler.
- **Inline icon actions** (vote arrows, single-glyph toggles) → the one sanctioned exception: render `disabled` with a `title="Sign in to …"` tooltip. Use only here, not for primary actions.

`protectedProcedure` is the server backstop, not the UX — relying on it alone produces a raw `UNAUTHORIZED` toast, a silent no-op, or a doomed half-filled form. Banned guest treatments: silent `onClick` early-return, static non-clickable "log in to…" text, raw `error.message` rendered to the user, and ungated `.mutate()`.

### Named Rule (data states)
**The No-Silent-Failure Rule.** Every data fetch handles three states explicitly: loading → `<Skeleton>`; error → `<ErrorState onRetry>` (or hide, for purely supplementary widgets); empty → `<EmptyState>` (or hide). **Never** `if (!data) return null` as the only branch — a failed load must be distinguishable from "nothing here." Errored core sections show the error + retry; only optional/supplementary widgets may stay quietly absent.

## 6. Do's and Don'ts

### Do:
- **Do** keep the body background pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`). Carry warmth through copy, imagery, and the accent — never a tinted cream surface.
- **Do** ration Signal Orange to ≤10% of a screen (the One Voice Rule). One primary action, one active state.
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
