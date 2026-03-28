# Mobile Responsiveness - Full Site Audit & Fix Design

**Date:** 2026-02-26
**Status:** Approved

## Context

Most traffic comes from mobile devices. Full audit revealed 10+ components needing responsive fixes across challenges, blog editor, sponsors, jobs, events, home page, and member profiles.

## Changes

### HIGH Severity

1. **Challenge Card** - Stack layout on mobile, wrap badges
2. **Challenge List** - Reduce mobile top padding
3. **Dashboard Events** - Stack rows on mobile (match home events pattern)
4. **Blog Editor** - Responsive left padding (`pl-4 sm:pl-14`)
5. **Slash Command Menu** - Responsive width (`w-[calc(100vw-3rem)] sm:w-[320px]`)
6. **Sponsors Table** - Mobile card layout alternative to horizontal scroll table
7. **Sponsors Grid** - Tighter gap on mobile

### MEDIUM Severity

8. **Home Stats** - Remove col-span-2 from last stat item
9. **Home Hero** - Reduce min-height on mobile (`min-h-[50vh] sm:min-h-[70vh]`)
10. **Jobs Page** - Stack cards on mobile
11. **Event Detail Meta** - Hide pipe separators on mobile
12. **Member Detail** - Responsive XP bar width, tighter header gap

## Approach

All Tailwind class adjustments. No logic changes, no new dependencies.

## Files Modified

- `src/components/challenges/challenge-card.tsx`
- `src/components/challenges/challenge-list.tsx`
- `src/app/[locale]/dashboard/events/page.tsx`
- `src/components/article-editor/article-editor.tsx`
- `src/components/article-editor/slash-command-menu.tsx`
- `src/app/[locale]/sponsors/page.tsx`
- `src/app/[locale]/page.tsx`
- `src/app/[locale]/jobs/page.tsx`
- `src/app/[locale]/events/[slug]/page.tsx`
- `src/app/[locale]/members/[id]/page.tsx`
