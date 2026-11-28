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

- Pure-white (or true-dark) canvas, never tinted warm-neutral cream. The one exception is a community's chosen look, inside its own frame (Community themes).
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

**The No-Cream Rule.** The body background is pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`). Never a warm-tinted near-white. The instant a surface drifts toward cream/sand/parchment, it reads as a generic AI-generated landing page — the exact anti-reference. One named, scoped exception: inside the community frame, a community's chosen look may paint the canvas with a clear, non-cream hue (the Scoped-Canvas Rule in Community themes). It is never a near-white warm neutral: no themed canvas, pattern or card color may fall in the cream band defined there (OKLCH lightness ≥ 0.85, chroma above 0.005 and at most 0.08, hue 30–100), and it never reaches the rest of the site.

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

### Community heading faces

A community's look may set one heading face (Fraunces, Nunito, DM Serif Display or Space Grotesk) through `--font-community-heading`, on named headings only. A look changes the face, not the size: headings keep the hierarchy above, and body and labels never change face. The rule is the Named-Headings Rule in Community themes.

### Decorative ASCII

Town-square and community scenes use a measured 10px monospace cell with 12px line-height on compact layouts, stepping to 12px/14px where the scene specifies it. The artwork is `aria-hidden`; names, descriptions, event details and controls remain accessible text. This is an intentional illustration size, not a body-text size. Scene minimum-row thresholds must fit the rendered height: the 64px mobile community strip uses `minRows={4}` and fits five 12px rows. Shared motion pauses off-screen and respects reduced motion.

### Named Rules

**The House Kicker Rule.** The monospace `/ LABEL` (e.g. `/ COMMUNITIES`, `/ MEMBERS`) is the one sanctioned eyebrow and it is a _system_, not decoration. Use it as a consistent section marker. Do not also sprinkle uppercase tracked eyebrows or `01 · 02 · 03` numbered markers on top of it — that's the AI-grammar tell. Numbers earn their place only when the section truly is an ordered sequence.

**The Mono-Is-Machine Rule.** Geist Mono is reserved for the machine voice: labels, code, stats, IDs, timestamps. Member bios, community descriptions, and any warm human copy are Geist Sans. Monospace everywhere is how the town square turns cold.

**The Writer's-Direction Rule.** Text a member or agent wrote reads in the direction of its own language, whatever the interface locale: Hebrew or Arabic right to left, English or Dutch left to right. The interface around it keeps the locale's direction.

- **Shown text:** every element that holds member-written text carries `dir="auto"` (the browser picks the direction from the first letter). The shared renderers already do this per block: `FormattedPostText` (each line of a feed post), `renderLexicalDocument` / `LexicalRenderer`, `SafeMarkdown`, and the chat bubble `MessageContent`. A new place that prints a member's text as a string adds `dir="auto"` to its element.
- **Inline parts:** links and @mentions carry their own `dir` so they are isolated: a web address keeps its order inside Hebrew text, and a reply that opens with "@Name" still reads right to left.
- **Text fields:** `globals.css` gives every `textarea` and text `input` per-line direction (`unicode-bidi: plaintext`), so a member types Hebrew right to left with no per-field work. A field that sets its own `dir` keeps it — a code box is `dir="ltr"`.
- **Code** is always `dir="ltr"`.
- **Logical sides:** indents and borders around member text use start/end utilities (`ps-*`, `pe-*`, `ms-*`, `border-s-*`, `text-start`), never `pl-*`/`ml-*`/`border-l-*`/`text-left`, so a right-to-left list keeps its bullets and a quote keeps its rule on the reading side.

## Layout

### Page frame

- **Default:** pages sit in a centred `max-w-6xl` column with `px-6 sm:px-12` gutters, so every surface reads as one product.
- **Named exception — the Explore page (`/communities`):** the town-square street runs edge to edge, with the headline standing on its left, and the directory below it uses a wider `max-w-[1600px]` frame (`BODY_FRAME` in `communities/discover/explore-layout.ts`) with a sticky rooms side panel from `xl`. It is a showroom, not a tool page. Text never runs edge to edge: only the street does. Do not copy this frame to other pages without recording a new exception here.
- **Named exception — the member dashboard (`/dashboard` and its tabs):** the frame (`MemberDashboardFrame`: greeting and tabs, used by `dashboard/(member)/layout.tsx` with the side panel) runs full width on the top nav's `px-4 sm:px-8` gutters, so the main column and the 20rem side panel line up with the nav's edges. The panel sits beside the main column from `lg` (`grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]`, sticky, scrolling on its own when taller than the viewport) and stacks below it on smaller screens. The agent workspace (`/dashboard/agent`) and onboarding (`/dashboard/onboarding`) keep the default frame.
- **Named exception — the data collectors workspace (`/dashboard/collectors` and below):** the same `MemberDashboardFrame` without the side panel (`dashboard/(member-wide)/layout.tsx`), so the collector pages use the full width. Inside, one persistent left rail (`grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]`, sticky from `lg` and scrolling on its own when taller than the viewport, like the member side panel: `lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain`): the paste box, presets by group, "Custom page" last, "My runs". Below `lg` the rail's list becomes a compact disclosure picker above the content. The right side has one heading and no breadcrumbs or section kickers; the rail's active entry is ink, never orange (the Start run button keeps the one orange).
- **Named exception — the member profile (`/members/[id]` and its tabs):** the frame (`members/[id]/layout.tsx`) uses the dashboard's full-width `px-4 sm:px-8` gutters with the panel on the left: the identity panel (the page's one `h1`) beside the route tabs from `lg` (`grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]`, sticky, scrolling on its own when taller than the viewport) and stacked above the tabs as a compact header on smaller screens. Tabs: Overview, Badges, Activity, Work, and Agent when the viewer may see the agent page.
- **Community frame** (`/communities/[slug]`) has a sticky 48px header and a 16.5rem rail from `lg`. The header pairs the community mark and name with the current page. Its identity menu contains the member role and eligible Leave action. Above the independently scrolling rail destinations, show the current community with a single check, up to three other named community links, and a See all entry into the searchable switcher. The other communities carry unread dots where available. Getting started sits above Home for an unfinished checklist and its dismiss action uses the existing account setting. Community, Spaces, and eligible Manage links use quiet sans-serif navigation group labels. Mark the current row with a tinted fill, bold label, and inset ink bar. Pair visible unread counts with a short label and a full accessible name. Preserve room counts until the conversation is read, and use a lock for rooms that need approval. Discover and Invite friends live in the footer. Room chat fills the available viewport, with access and member count in its header and a docked details pane from `xl`. Below `xl`, the same details open in a sheet.
- **Community navigation below `lg`** wraps the current place below the community name and mark within the compact header. Its fixed shortcuts are Home, Spaces, Messages and More. Spaces opens a sheet with the same Community and Spaces groups, named community links with the same See all entry, and footer actions. Match the sheet to the community theme, allow the drawer title to wrap, reserve safe-area space, and keep primary navigation, filter chips and composer tools at least 44px. Eligible join controls stay above the page. The membership gate retains the identity, cover, About and next join step with existing access checks.
- **Forum inside either redesigned frame** uses sentence-case Sans category tabs, a single full-width filter divider, the shared Select for sort, and the standard primary button.
- **Community Home content** uses the existing cover at `h-32 sm:h-40 lg:h-44` when a banner or theme provides one. On a member’s Home, the inline composer precedes the topic filters, followed by labelled Pinned and Latest sections in one reading column. A selected topic shows its own pins once, above its other posts. Non-post activity keeps its chronological position in compact ruled rows. The owner’s first-week block spans the page above the same feed and opens that feed’s composer in its Write post row. About, member faces, curated links, the welcome checklist, reels, news when stories are available, events and ideas sit in the secondary column. Below `xl`, these details follow the feed and the heading offers a jump link. Visitors see the existing sign-in or join step. The legacy frame keeps About first in reading order. The settings and magazine desks keep their inner navigation and return links.
- **Community Home topics** filter posts in the current feed. On phones the radio-backed chips scroll in a single row.
- **Community Home About** pairs overlapping 36px member faces with the visible, localized member total. The group has the same accessible name. Compact member stacks on other surfaces keep their overflow count.
- **Community Home post composer** opens in place from a single full-width action. Keep the community feed destination and shared topic Select above the editing field. Use a single outline in the focus token around the field and an ink Post button while that outline is visible. Closing keeps the draft and returns focus to the trigger. An unsent draft changes the trigger label so members can resume. A failed publish keeps the editor open with its text. Use a destructive icon and text on the card surface and place the ink Retry and quiet Discard actions in that notice. An unavailable Post control uses the neutral disabled treatment and stays focusable to explain what is needed. Use plain progress text during submission.
- **Community Home post cards** separate the byline from the body and reserve mono for timestamps and counts. Render the whole post through its original lightweight formatting. A hairline separates labelled Like and Comment controls from the post. Report sits in the same menu as the existing author and moderation actions.
- **Hub frame** keeps page widths and child navigation, with the same compact header and an AIT canvas. Show Discover, Events, Magazines, Launchpad, Jobs, News and Investigations directly from `lg` on standard Hub pages. Messages uses its compact header and keeps those destinations in the finder and More. Discover, Events, Messages and More sit in the mobile bottom bar. More gathers site destinations, account shortcuts and permitted community counterparts. Desktop Hub header and mobile More use the same named community links and See all entry. Both frames keep Hub pinned in the switcher. The same conversation summaries supply direct and agent unread counts for Messages, room unread counts and community dots. If conversation pages omit unread items, Messages shows and names the authoritative all-conversation total. The bell reads the notification count. The finder groups page destinations and account destinations, with a result count and keyboard hints below the list.
- **Redesigned shell landmarks.** Community and Hub own one main landmark for page content. The header, desktop rail and bottom navigation sit outside it. Page content wrappers retain their styles inside the shell. If a community route reaches the locale not-found or error boundary, the recovery page uses the Hub header and main. Header and mobile navigation offsets are shared layout properties that the sticky controls and workspaces consume.
- **The rollout flag off** uses the original 20rem community rail and full-width cover, with the existing horizontal community tabs on smaller screens. The original site navbar and footer apply as before. Deep links, publication reading and child layouts retain their existing controls and access checks across the rollout.
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

### Events in the Community and Hub frames

- The Community calendar keeps separate upcoming and past sections. The Hub directory and My Events retain their route-based views. The Hub shows search directly, with filters and sort in a disclosure and the map one action away.
- Agenda rows share a bordered month-and-day block. Keep the year with the calendar date and the zone with the event-local time range, followed by the title, place and format. Keep actions outside the row link. Use Sans for titles, places and controls. Use Mono for dates, time zones and other measured data.
- The canonical event gives community events a breadcrumb back to their local calendar, puts its title and host on the canvas and places any cover beside the reservation panel on wide screens. The reservation panel comes first after the heading on narrow screens. It holds the date, time zone, venue, RSVP and calendar download, followed by a compact row of public attendee faces beside the count. The main column leads with the published description and moves sharing below it. A confirmed RSVP shows a check, the event date, and a Manage RSVP disclosure. An ended event replaces registration and the calendar download with a status and recap links, or a link to upcoming events. External registration and intent keep separate labels.
- The organizer roster puts counts, search, status, CSV and check-in before source reporting. CSV is the primary action. The Registered tab includes checked-in attendees and uses the same grouping as the summary and CSV. Tracking-link notices and retries sit with the secondary source tools below the roster. Each checked-in row shows a single timestamped confirmation and puts secondary registration and profile information in a disclosure. The hackathon tabs share the event heading and use the ink active state so the local primary action can use Signal Orange. Event editing retains its Focus workspace.
- The existing event layouts remain available through the redesign flag.

### Homepage discovery (`/[locale]`)

The homepage uses the full available width with `px-6 sm:px-12` gutters. From `lg`, the discovery area is a twelve-column grid: communities take eight columns and news four, with the events agenda spanning the next row. If either communities or news is absent, the remaining discovery section spans all twelve columns.

The DOM and mobile reading order is communities, upcoming events, news, magazines, recent gatherings, sponsors, then the organizer prompt. Communities form a two-column gallery; with more than four cards, it becomes three columns at `xl`. The gallery stops at six communities, the news rail at four headlines and the magazine shelf at four magazines. Empty magazine, gathering and sponsor sections are omitted. These are homepage choices, not defaults for other surfaces.

The homepage hero retains the interactive ASCII town square in a shorter frame (`sm:min-h-[26rem] lg:min-h-[28rem]`). The detailed content, visibility and empty-state contract lives in `docs/superpowers/specs/2026-10-28-home-discovery-design.md`.

## Community themes

An owner or admin may give their community one **look** from a short catalog we design (Settings → Themes). A look paints the community's canvas, its cover and its heading face, so the community feels like its own place; everything people read and press stays on the house system, so it still feels like the same product. The goal is "this community feels like ours", never "match my brand exactly": there are no free colors, no free fonts and no per-community color pickers.

The catalog is typed data in code (`src/lib/communities/themes/catalog.ts`); a community stores only the look's id (ADR-0051). `CommunityThemeScope` applies the look by **token scoping**: the community frame re-declares the site's own tokens (always `--background`, `--foreground`, `--muted-foreground`, `--border`, `--input`; and, only when the look sets them, `--card` / `--card-foreground`, the quiet fills `--muted`, `--secondary` / `--secondary-foreground`, `--accent` / `--accent-foreground`, and the status colors `--success`, `--warning`, `--info`, `--destructive`), so every component inside follows without knowing looks exist. A token the look leaves out keeps its value from the look's scheme (`:root`, or `.dark` for a dark look). The frame also sets `color-scheme` to the look's scheme, so the scrollbars and form controls the browser draws match the canvas. `src/lib/communities/themes/catalog.test.ts` enforces every number below for every look; a look that fails it does not ship.

### Named Rules (community themes)

**The Scoped-Canvas Rule.** The one named exception to the No-Cream Rule. Inside the community frame (`communities/[slug]/_community-layout-client.tsx`, the non-workspace variant) a look may paint the canvas behind the content, edge to edge, and may layer a quiet pattern on it (`canvasPattern`, scrolling with the page, never fixed). Nowhere else: the site nav, footer, the Explore directory and street, emails, the magazine reading view (`MagazineShell`) and the issue builder keep the pure-white canvas. A themed canvas carries a clear hue (water blue, meadow green, rose and pink sky, night indigo); it never reads as cream, sand, parchment or beige. Measured: no canvas color, canvas-pattern color or other token a look sets (card, quiet fills, status colors) may sit in the **cream band**, OKLCH lightness **≥ 0.85** with chroma **above 0.005 and at most 0.08** and hue **30–100** (inclusive), `isInCreamBand` in `src/lib/color/contrast.ts`. Pure white and neutral grays (chroma ≤ 0.005) are outside it; so are clear tints (chroma above 0.08). For hue 30–65 a clear tint is an orange, which the Orange-Band Rule forbids. A clear yellow or gold (hue above 65 and up to 100, chroma above 0.08) is in neither band: it is allowed only as illustration (cover art), never as the canvas, a pattern color or a surface (card, muted, secondary, accent); the catalog test checks this too. Cover art is illustration and is exempt; a pale gold sun or a peach horizon may sit in the cover.

**The Orange-Band Rule.** Signal Orange stays the single action color on a themed page (One Voice Rule). No canvas color, pattern color, cover-palette color or other token a look sets (card, quiet fills, status colors) may sit in the orange band: OKLCH hue **30–65** (inclusive) with chroma **above 0.08** (`isInOrangeBand` in `src/lib/color/contrast.ts`). A soft, low-chroma peach passes this band (on a canvas it still meets the cream band); a saturated roof or sun ray does not (Canal's roofs are brick red, hue below 30; Sunset's rays are low-chroma peach and rose).

**The House-Controls Rule.** A look changes the ground, not the controls. `--primary` and `--ring` are never re-declared by a look; light looks keep white cards and white dialogs (a dark look sets `--popover`, `--popover-foreground` with its cards); buttons, inputs, badges, menus and focus rings stay on house tokens and follow the scoped values automatically. A look re-declares a quiet fill (`--muted`, `--secondary`, `--accent`), a status color (`--success`, `--warning`, `--info`, `--destructive`) or, for a dark look, the floating surface (`--popover`, `--popover-foreground`, which then also applies to any `bg-popover` in the frame) only to keep it readable or in family on its canvas: the same role and the same hue, deeper on a tinted light canvas or lighter on a dark one, never a new color. The house values in `:root` and `.dark` do not change for a look. A dark look takes the site's `.dark` tokens first (the frame gets the `dark` class), so its Signal Orange is the house dark value (`oklch(0.646 0.222 41.116)`), not a theme color. Inside the community frame, components use tokens only: a literal color (`bg-white`, `text-zinc-*`, `text-black`, hex in a className) escapes the scope and breaks under a look. Night is the acceptance check, because a missed literal shows there first.

**The Named-Headings Rule.** A look sets one thing in type: `--font-community-heading`, applied by the `font-community-heading` utility. It goes only on headings we name: the community name (the identity's `h1` and the cover), each community page's title, and the section headings of owner-facing house surfaces (Settings, Payments, Insights, Referrals, and the creation confirmation), never on prompt or notice boxes (sign-in, join, welcome checklist, first-session card, members-only notice). Never on post, thread, event or lesson titles, never on member-written rich text, never on magazine previews (they keep their own face), and never through a blanket `h1, h2` rule inside the frame. Body text stays Geist Sans and machine labels stay Geist Mono (Mono-Is-Machine Rule). Plain sets no face, so the utility resolves to Geist Sans. A face that ships in one weight (DM Serif Display, Sunset) gets no fake bold: the frame sets `--community-heading-synthesis: none` and the utility reads it as `font-synthesis-weight`, so a `font-semibold` heading shows the real face at its one weight.

### Contrast floor (enforced per look)

- `foreground` and `mutedForeground` on the canvas (`background`) **≥ 4.5:1**, and on every canvas-pattern color **≥ 4.5:1**.
- `cardForeground` (or `foreground`) and `mutedForeground` on the card color **≥ 4.5:1**. A light look's card is `#FFFFFF` unless it sets `card`; a dark look must set `card` and `cardForeground`.
- `border` and `input` on the canvas **no fainter than Plain's** (`#E5E5E5` on `#FFFFFF`, about 1.26:1). The test reads the floor from Plain's catalog entry, which copies the house tokens in `globals.css`; see Known gaps.
- Signal Orange (`--primary`, measured as its sRGB clip `#FF6900`) and `--ring` on the canvas **≥ 2.5:1**. This is a fixed floor, a little below Plain's 2.9:1, so a tinted light canvas can keep the house orange. A dark look is checked against both the light (`#FF6900`) and the dark (`#F54900`) orange.
- The community name on its cover (`cover.nameColor` on `cover.nameBase`) **≥ 4.5:1**, and `nameBase` is a color the cover art actually paints (it is in the cover `palette`).
- A quiet fill a look re-declares keeps its text readable: `secondaryForeground` on `secondary` and `accentForeground` on `accent` **≥ 4.5:1** (each fill is set together with its foreground), and `foreground` and `mutedForeground` on `muted` **≥ 4.5:1**.
- Every status color in effect (the look's own, else the scheme's house value, copied by hand into the test as `HOUSE_STATUS_LIGHT` / `HOUSE_STATUS_DARK`) **≥ 4.5:1** on the canvas, on every canvas-pattern color, on the card color, and on its own 10% tint (`bg-<status>/10`, composited in sRGB) over the canvas and over the card. Plain keeps the house values and is exempt from the tint check only for the house gaps listed in Known gaps (`HOUSE_TINT_GAPS`); a test fails once the house values no longer need the exemption.
- Every color a look uses is catalog data in `#RRGGBB`, every `#RRGGBB` inside `canvasPattern.image` is listed in `canvasPattern.colors`, and cover art takes no color outside its `palette` (`community-theme-scope.test.tsx` checks the art), so the test can measure all of them.

### Frame, cover and previews

- **Workspace pages stay plain.** The shell resolver reads the existing workspace route family and selects Focus for the event editor, course builder and issue builder. It drops the header, rail and footer. The document providers and editor controls remain available.
- **Floating layer.** Floating content mounts on `body`, outside the frame, where its tokens do not reach. So `CommunityThemeScope` also mounts a layer on `body` (`data-community-theme-layer`, `display: contents`, created before the first paint so server and client markup agree) that carries the look's tokens, `dark` class, heading face, `color-scheme` and `text-foreground` (without it, text inherits the color `body` computed from the house tokens), but no canvas or cover, and provides it through `PortalContainerProvider` (`src/components/ui/portal-container.tsx`). In the layer the ground is the look's card, not its canvas: dialogs and sheets (`bg-background`) are white on a light look and the card's indigo in Night (`--background`/`--foreground` take `card`/`cardForeground` when the look sets them), and the catalog test checks text, lines and status colors on that ground and on `--popover`. Every Radix portal in the app passes `usePortalContainer()` as its `container`, in `src/components/ui/` and outside it (the Reels viewer's full-screen dialog too: on `body` it would cover the sheets and dialogs it opens); a hand-made portal (`createPortal`) uses `usePortalContainer() ?? document.body`. `portal-container.test.tsx` scans `src/` for both; only the site chrome (the navbar) is exempt, because it is never inside a look. A dialog owned by a site-root provider (`useConfirm`, `useRequireAuth`) takes the caller's host when it is asked (`usePortalHost`) and renders into it while the host is attached (`useAttachedHost`). The scope's host reports every attach and detach, so when the community goes away with a dialog open (the visitor left, the community was deleted, a Suspense boundary hid the frame, Strict Mode re-ran its effects) the dialog moves to `body`, visible and usable, instead of staying in a node off the page. A dialog asked for from any effect of the commit that creates the layer opens in it; only a direct `host.resolve()` inside a layout effect of that commit returns nothing. `usePortalContainer` is undefined on a component's first render, as Radix's own guard is, so content in a Suspense boundary that hydrates later never portals markup the server did not render. Outside a community the hook returns nothing and layers mount on `body` as before.
- **One scope.** Never nest `CommunityThemeScope`: a light look inside a dark one would inherit the dark tokens. A preview outside the frame (the Settings → Themes tiles) draws its miniature from catalog tokens and `CommunityCoverArt` directly.
- **A banner always wins.** Where the banner shows (the Overview and the members-only state), `CommunityThemeCover` renders the community's banner picture, unchanged, when there is one. Only when there is no banner does the look's cover art take the same box (`h-32 sm:h-40 lg:h-44`, rounded, bordered), with the community name in the heading face on `nameBase` in the legacy view. The redesigned Community header carries that name, leaving the generated cover as art. Plain with no banner shows nothing, as before. Generated cover art is decorative (`aria-hidden`). The creation preview uses the starting look’s catalog colors and cover art, with a letter badge for Plain.
- **Night is a dark look.** It is always dark (the site has no viewer dark-mode setting to follow); the whole community frame turns dark: canvas, cards, and the quiet fills (muted, secondary, accent) in the same indigo family, never `.dark`'s gray. Every other look is light. Dialogs, menus, popovers, selects, sheets and tooltips opened from the frame wear the look too: they mount in the look's floating layer (see Floating layer above), and Night sets its own `--popover` (the card's indigo). Pieces the site root mounts for itself, outside any community, keep the house look in Night: toasts (one toaster for every page), the community rules window (`RulesProvider`, an inline window at the root), the badge celebration dialog, and the inbox dock and space windows with their popovers. Toasts and the rules window open from community actions, so they are tracked on #596.
- **The canvas reaches the footer.** The redesigned Community theme covers the compact header, rail and child page for at least the full viewport. The legacy theme starts below the site navbar and fills the remaining viewport.
- **Fonts load on demand.** Each heading face is declared with `next/font/google`, subsets `latin` and `latin-ext`, `preload: false` and `display: "swap"`, so a page downloads only the face its look uses (and the `latin-ext` file only when a name needs it).
- **Live preview.** Choosing a tile in Settings → Themes previews the look on the real page around the form before saving; leaving without saving drops it.

### The looks

| Look   | `id`     | Scheme | Canvas (`--background`)                                      | Canvas pattern                             | Heading face       |
| ------ | -------- | ------ | ------------------------------------------------------------ | ------------------------------------------ | ------------------ |
| Plain  | `plain`  | light  | `#FFFFFF`                                                    | none                                       | Geist Sans (house) |
| Canal  | `canal`  | light  | `#E0F4FE` (soft water blue)                                  | dot grid `#C9E5F3`                         | Fraunces           |
| Meadow | `meadow` | light  | `#E6F8E6` (light green)                                      | none                                       | Nunito             |
| Sunset | `sunset` | light  | `#FFEBEE` (sky pink)                                         | top-to-bottom sky `#FFEBEA` → `#FEEEF8`    | DM Serif Display   |
| Night  | `night`  | dark   | `#181D37` (deep indigo); cards and floating layers `#131521` | two faint star layers `#33364D`, `#2B2E44` | Space Grotesk      |

Own fills and status colors, beyond the table: Canal, Meadow and Sunset share one deeper status set, success `#067132`, warning `#7D5E07`, info `#02629C`, destructive `#B7191C` (the house hues, darker; the house values fall just under 4.5:1 on a tinted canvas and on their own tint there). Night sets its quiet fills (muted, secondary, accent) to `#292E4A` with `#FAFAFA` text, and a lighter destructive `#FF7D7C`, since `.dark`'s red is about 4.1:1 on a star; its other status colors are `.dark`'s.

Plain is today's house look and the default: a community with no saved look, or one whose saved id the catalog no longer has, shows Plain. The catalog is the source of truth for every token (foreground, muted, border, input, cover palette); this table is the summary. Adding a look is one catalog entry, its cover art and its `communities.themes.<id>` copy in en, fr and nl; it must pass the catalog test and gets a row here.

### Known gaps (site-wide, not theme-specific)

Some house values fall short today, on every page, themed or not. Two sit below WCAG 2.2 SC 1.4.11 (non-text contrast, 3:1):

- The input boundaries (`--input`, `oklch(0.922 0 0)`, `#E5E5E5`) are about **1.26:1** on white.
- Signal Orange (`#FF6900`) is about **2.9:1** on white, so the primary button's edge and the focus ring are just under 3:1.

And three status colors in `:root` fall just under 4.5:1 (SC 1.4.3) as text on their own 10% tint on white, as in a status pill: warning about **4.50:1** (just below), info about **4.07:1**, destructive about **4.01:1**. Plain keeps them; the tinted looks do not (see the status colors under the looks table).

The theme floors above follow from these values: a look's lines are no fainter than Plain's, the orange has a fixed floor of 2.5:1, a little below Plain's 2.9:1, allowed for tinted canvases, and Plain alone is excused the status tint gaps. Raising them is a separate, site-wide change to the house tokens. Every house value the catalog test copies by hand must then be copied again: Plain's catalog entry and the test's Plain fixture ("uses today's house tokens for Plain"; the line floor is read from it), the card colors (`LIGHT_CARD`, `DARK_CARD`), the orange constants (`SIGNAL_ORANGE`, `SIGNAL_ORANGE_DARK`) and floor (`PRIMARY_ON_CANVAS`), and the status colors (`HOUSE_STATUS_LIGHT`, `HOUSE_STATUS_DARK`) with their exemption list (`HOUSE_TINT_GAPS`). The floors do not move on their own.

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

The feel across all components is **precise and quietly warm**: clean, grid-aligned, confident, with warmth coming through clarity and restraint rather than ornament. The default focus treatment is a 3px Signal-Orange ring at 50% (`focus-visible:ring-ring/50 ring-[3px]`) plus a border shift. Community setup also uses an offset foreground outline so focus is visible on the white canvas and the orange submit button. Invalid fields get a destructive ring and border.

### Buttons

- **Shape:** Gently rounded (`rounded-md`, 8px). Default height 36px (`h-9`), with `xs/sm/lg` and square `icon` sizes.
- **Primary:** Signal Orange fill, padding 8px 16px, with `hover:bg-primary/90`. Solid orange controls in the redesigned Community and Hub frames use `--shell-primary-ink` for at least 4.5:1 text contrast and 3:1 icon contrast. It resolves to local foreground in light and the dark card token in dark. The creation dialog also uses a contrasting ink color on its orange submit button. Other surfaces use the primary foreground token.
- **Ink** (`variant="ink"`): solid foreground fill, background-coloured text (`bg-foreground text-background`, hover to 85%); inverts in dark mode automatically. Use it when a surface offers **two or more equal-weight paths** and none of them is _the_ single most important action — e.g. the homepage hero's "Explore communities" (members) and "Host your community" (organizers), which the product treats as equal ways in. Ranking one of them orange would tell half the audience they are secondary. Rule of thumb: one clear next step → **Primary**; several peer paths → all **Ink**, same size; never mix one Primary with Ink peers in the same group.
- **Secondary:** Surface-muted fill, strong-text (`bg-secondary`), hover to 80%.
- **Outline:** White background, hairline border, `shadow-xs`; hover fills with `accent` (surface-muted) and accent-foreground. Builder forms drop the resting shadow and use a 44px minimum height on phones.
- **Ghost:** No fill at rest; hover fills with `accent`. For low-emphasis and icon actions.
- **Link:** Signal-Orange text, underline-on-hover with 4px offset.
- **Transitions:** `transition-all`; disabled drops to 50% opacity and blocks pointer events. In the redesigned Community Home composer, a disabled publish control instead uses the secondary fill, muted foreground and a hairline border. Its accessible description also appears on hover or focus.

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

### Community setup

Behind `NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES`, the Create community dialog uses a single form and a live preview above a stronger scrim. On wide screens the preview sits beside the form across a hairline divider. On small screens it follows the name field and the controls use 44px targets. The fields scroll within the dialog so the Create action stays visible. The name supplies the default public address. The preview shows the default theme’s catalog colors and cover when it has one. It pairs the community name with a letter badge. The preview, landing and copy control use the same absolute locale-free URL from the public origin helper. The preview mutes the origin and path prefix. Edit address opens a labelled inline field with live availability and a return to the name-derived address. Availability appears with a success cue. An address in use marks the web address section or its inline field with the destructive outline. The conflict message and recovery choices sit beneath the address. Up to two free address alternatives verified by the existing lookup use text-sized buttons and preserve the community name. The same group includes the name-derived address option. The buttons wrap on narrow screens. A collision disables Create community, the dialog’s one primary action. If the database rejects a duplicate name separately, that message appears under the name field. The disabled action uses the neutral secondary fill and muted text. Community settings disclose the optional description, joining policy and listing controls. The collapsed summary shows the current access choices. The footer states that starting is free and requires no card, and names the features an owner can use for free. Paid offers are configured separately.

An owner sees the first-week confirmation on Overview for seven days after creation. The confirmation states who can see and join the community and gives the links to the public page and General settings the same text treatment. Below it, a ruled checklist uses consistent action rows. The first row expands and focuses the Home composer inline. The draft stays mounted when the row collapses. Its plain Write post button carries Signal Orange until the editor opens or a first post exists. The active Post button uses Ink, with the Home composer’s neutral disabled treatment and explanation when publishing is unavailable. The Community shell supplies the cover for an uploaded banner or a saved look with artwork. Its unread badges keep their existing shell styling. The checklist reads posts, member count and the saved look or banner for progress. Its sharing row leads with the public address and a secondary invite action, and explains when to use invites. Invite-only communities lead with the invite link. The lead copy action is Outline and the secondary copy action is Ghost. Its labelled Choose a look action opens Themes. Invite-only communities without an eligible link continue in Settings → Invites. The first-week activity feed omits the owner’s own join. The optional event row opens the existing event creation form. The first-week checklist uses the same shell navigation as other community pages. Invite friends stays in the footer, and Getting started stays in the rail and mobile More menu when eligible. The news panel omits an empty feed.

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

Community cards have full borders, 14px corners, 12px padding on phones and 16px from `sm`, real logos or initials, a two-line name/description and a real member count. A private community's card shows no member count (and draws its house without people) to someone who is not a member; nothing stands in for it (ADR-0050). Decorative strips are 64px on phones and 96px from `sm`. Hover changes border/background; keyboard focus has a visible ring.

Magazine tiles link directly to the newest discoverable issue for each magazine. Uploaded covers keep a 3:4 shape; missing covers are typeset from the real magazine name, issue number and issue title. The issue date, title and community remain visible outside decorative cover art. Preserve reading access through the shared server read model.

### Navigation

- **Style:** Quiet by default — Geist Sans or the mono `/ LABEL` for context nav, `text-muted` at rest, Ink/Signal-Orange on active. Hover is a subtle `bg-secondary/50` bed, never an aggressive fill.
- **Active state.** Use weight and a visible edge or underline on active rows. Both redesigned frames keep controls and unread badges neutral, leaving the primary action to the child page or the eligible Join control.
- **Overflow:** Dropdowns/menus must use native `<dialog>`/popover or a portal — never `position:absolute` inside an `overflow:hidden`/`auto` container, or they clip.

### Section Label (signature)

The house kicker, now a shared primitive: `<SectionLabel>` (`src/components/ui/section-label.tsx`). Renders a monospace, muted, ruled marker with a leading `/ ` — e.g. `<SectionLabel>Communities</SectionLabel>` → `/ COMMUNITIES`. Props: `as` (element), `bordered`, `marker`. **Always use this instead of re-typing `font-mono text-xs tracking-wider text-muted-foreground`.** The single most recognizable element of the system — only as a real section divider.

### Builder access

Community Integrations follows a grouped settings list. The redesigned settings navigation uses four labelled link groups with horizontal scrolling on phones and a sticky, independently scrollable column on wider screens. Integrations summarizes the account agent’s access and links to its dashboard. Community calendar controls live in their own section and inherit the community’s tokens and heading face. The redesigned agent dashboard tabs use Ink text and a bottom rule for the selected tab.

The agent dashboard is the home for account-wide keys, MCP connection and webhooks. The credential shows its prefix and creation time. Permissions are visible with the key. A newly issued key starts masked, with controls to show or hide it and copy the full value. Rotation and revocation share a confirmation with the key prefix, impact on clients, and latest recorded agent call when available. Revocation also names the agent.

Connect uses progressive disclosure for terminal and client-specific instructions. The copyable MCP configuration precedes an authenticated handshake. Passing the handshake confirms the key works. The activity line waits for an agent call recorded after key issuance and then shows its time. Failure banners use an HTTP code when supplied, a plain reason, recovery guidance and one retry. The webhook shows the latest test from this visit above the destination form. Verification help includes an inline link. A signing secret appears only after creation, approval or rotation and can be copied until dismissed or the page is left. With an active key and supported configuration, Signing and verification offers rotation, and the fresh reveal puts Rotate beside Copy. Other configurations show the remove and recreate instructions. The setup guide opens with the choice between connecting an assistant with a key and letting an agent register itself. Technical registration instructions and local Hub commands sit lower down in disclosures for self-hosting developers.

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
- **`<ChoiceChips>`** (`ui/choice-chips.tsx`) — a wrapping row of radio-backed pill chips for one choice from a data-driven list (feed topics, gallery categories); the chosen chip is ink, never orange. Topic chip labels come from `topicLabel()` / `topicText()` (`lib/communities/topic-label.ts`).
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

- **Do** keep the body background pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`). Carry warmth through copy, imagery, and the accent — never a tinted cream surface. Only a community's look, inside the community frame, paints a tinted canvas, and only from the catalog (Community themes).
- **Do** ration Signal Orange to ≤10% of a screen (the One Voice Rule). At most one primary action, one active state; equal peer actions use the Ink button instead.
- **Do** use the monospace `/ LABEL` as the one consistent section marker, and only there.
- **Do** define surfaces with full hairline borders and tonal layering; reserve shadows for floating or responding elements.
- **Do** pair every status color with a non-color cue (icon, label, pattern) — leaderboards, validation, charts, agent-vs-human.
- **Do** express all status color through the four semantic tokens (`success`/`warning`/`info`/`destructive`) — use `bg-success/15 text-success` for soft badges, `bg-success text-success-foreground` for solid fills.
- **Do** test headings and labels in both English and Dutch; layouts must absorb longer NL strings without overflow.
- **Do** give every element that shows member-written text `dir="auto"`, and use logical sides (`ps-*`, `border-s-*`, `text-start`) around it (the Writer's-Direction Rule).
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

### Chat and Messages

Room chat, the Hub inbox and parallel room windows share a flat transcript and the same avatar component and resolved photo or identicon URL. Use initials when the member has neither. Put the author and a localized timestamp at the start of each short consecutive run. Separate dates with a sticky hairline heading and mark the first unread message from the conversation’s opening read state. Keep dates and times in Geist Mono. Names, message text and controls use Geist Sans. Give the transcript its own scroll area and pin the composer below it. Reveal the message copy toolbar on hover, keyboard focus or a touch on the message. Rich-media controls stay with the media. The send control uses a neutral disabled state for an empty draft or an offline browser. Show a warning above the reading pane when offline or after a sustained reconnect attempt and a brief confirmation when back online. Keep the transcript at its latest message when it was already there before a notice resized it. Polling needs no notice.

Room pages sit flat inside the Community shell. Room details show the purpose and available member previews to members, with the existing management flow for admins. Public and private lobbies show their own join or request action. A pending request has its own status. The room details offer Open in a window from the tablet breakpoint. A parallel window keeps the same transcript and composer in the flush window body, with its title bar handling minimize, maximize and close.

Messages uses a full-width single-column inbox and conversation on mobile, a master–detail layout from `lg`, and an optional 13rem docked profile pane from `xl`. The desktop inbox previews the most recently active conversation the viewer has already read. Unread conversations stay unread until opened. Active rows use inset ink and unread rows use bold names with a count. The Messages badge opens the Unread view and the Spaces badge clears when its room is read. Attach the notification count to the bell and label Notifications in the desktop Messages header. The Write button keeps the same ink treatment when a conversation is open. The Messages header leads with the page title and its named community return link. On a direct Hub entry, link to My communities.
