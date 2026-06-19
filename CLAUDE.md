# CLAUDE.md

## Design Context

This project has a documented design system. **Before generating or modifying any UI, read these — they are the source of truth for visual and UX decisions:**

- [PRODUCT.md](PRODUCT.md) — strategic intent: register (balanced; default lens **product**), users, brand personality ("warm & communal on a precise technical base"), anti-references, design principles, and the WCAG 2.2 AA accessibility bar.
- [DESIGN.md](DESIGN.md) — the canonical visual system: OKLCH tokens, Geist Sans/Mono type hierarchy, flat-by-default elevation, every component spec, and forceful Do's/Don'ts.

**Creative North Star: "The Town Square"** — warm and communal on a precise technical grid.

Non-negotiable named rules (full text in DESIGN.md):
- **One Voice Rule** — Signal Orange (`oklch(0.705 0.213 47.604)`) on ≤10% of any screen; it marks the single most important action or active state.
- **No-Cream Rule** — body background is pure white (`oklch(1 0 0)`) or true dark (`oklch(0.145 0 0)`); never a tinted warm-neutral.
- **House Kicker Rule** — the monospace `/ LABEL` is the one sanctioned section marker; don't stack other eyebrows or `01/02/03` markers on it.
- **Mono-Is-Machine Rule** — Geist Mono for labels/stats/IDs/timestamps only; warm human copy is Geist Sans.
- **Flat-By-Default Rule** — surfaces are border-defined and nearly flat; shadows signal floating or responding, not decoration.

Tokens live in [src/styles/globals.css](src/styles/globals.css); base components in [src/components/ui/](src/components/ui/). The `/impeccable` skill commands (critique, audit, polish, extract, etc.) read PRODUCT.md and DESIGN.md automatically.
