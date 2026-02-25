# Leaderboard Redesign

**Date:** 2026-02-22
**Status:** Approved

## Problem

The Members page has two issues:
1. Avatar images break when a user has no Gravatar (URL uses `d=404` which returns HTTP 404)
2. The page layout (horizontal scroll cards + member grid) doesn't feel competitive — the user wants a ranked leaderboard table

## Goals

- Fix broken avatar images
- Replace the page with a single competitive ranked table
- Rename page heading from "MEMBERS" to "LEADERBOARD"

## Design

### Avatar Fix

Change `d=404` to `d=identicon` in `src/lib/avatar.ts`. This makes Gravatar always return a generated identicon when no custom avatar exists, so the image URL never 404s. The existing conditional `{avatarUrl ? <img> : <initials div>}` can stay but the fallback to initials will only trigger when both `image` and `email` are null. Add `object-cover` to all `<img>` avatar elements.

### Page Structure

```
/ LEADERBOARD

[Search input — max-w-sm]

 #   MEMBER                    LVL   XP      BADGES   SKILLS
──────────────────────────────────────────────────────────────
 1   ◉ gregy                    1    150     2        AI  ML
     @ CompanyName
 2   ◉ alice                    1    80      1        NLP
```

### Table Columns

| Column  | Source                        | Notes                                |
|---------|-------------------------------|--------------------------------------|
| `#`     | map index + 1                 | Ranks 1–3 get brighter foreground    |
| MEMBER  | displayName + company         | Avatar (24px circle) left of name    |
| LVL     | profile.level                 | Existing pill style                  |
| XP      | profile.xp                    | Raw number                           |
| BADGES  | badgeCount                    | `—` if zero                          |
| SKILLS  | profile.skills.slice(0, 3)    | Dashed border tags                   |

Full row is a `<Link>` to `/members/[userId]`.

### Data

Remove `getLeaderboard` call — redundant. Use only `listMembers({ limit: 50 })` which is already sorted by XP desc. Rank = array index + 1.

### Styling

- `<table>` HTML element for proper column alignment
- `font-mono text-xs` throughout, matching site aesthetic
- Row hover: `hover:bg-secondary/50`
- Rank column: ranks 1/2/3 use `text-foreground`, rest use `text-muted-foreground`
- Empty state: centered `/ NO MEMBERS YET` message

## Files Changed

- `src/lib/avatar.ts` — change `d=404` → `d=identicon`
- `src/app/[locale]/members/page.tsx` — full rewrite of layout

## Out of Scope

- Pagination (keep limit: 50 for now, add later if needed)
- Sorting by other columns
- Real-time updates
