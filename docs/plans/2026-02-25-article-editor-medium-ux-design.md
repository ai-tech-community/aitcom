# Article Editor — Medium-style UX Redesign

**Date**: 2026-02-25
**Status**: Approved
**Scope**: `src/components/article-editor.tsx`, write/edit page wrappers

## Problem

The current article editor looks like a generic admin form. Fields are stacked with labels (TITLE, TYPE, TAGS, CONTENT), the toolbar is flat and utilitarian, and the quality panel sits awkwardly in a sidebar. The result is a data-entry experience, not a writing experience.

## Design Direction

**Medium-like**: Distraction-free, editorial feel. Clean canvas for writing, with metadata and quality checks moved to a pre-publish dialog.

## Section 1: Writing Experience (Main View)

### Layout

The editor becomes a pure writing canvas with three elements:

1. **Sticky top bar** (replaces current status bar + bottom action buttons)
2. **Borderless title input**
3. **Borderless content editor**

### Sticky Top Bar

- **Left side**: Save state (`Draft` / `Saving...` / `Saved at 14:32`), word count, reading time
- **Right side**: "Publish" button (or "Submit for review" for non-trusted authors)
- Subtle `bg-background/70 backdrop-blur` with thin `border-b`
- Sticky at `top-14` (below site nav)

### Title

- No border, no label, no "TITLE" text
- Large `text-3xl font-bold` input with placeholder "Article title..."
- Full width, transparent background
- Visually reads as "just start typing your title"

### Content Editor

- No border around the editor container
- No "CONTENT" label
- Subtle separator (`border-b border-border`) between title and content
- `min-h-[60vh]` — fills the viewport to feel like a real writing canvas
- No static toolbar — formatting via:
  - Slash commands (`/` on empty line — already built)
  - Keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
- `ToolbarPlugin` component is removed from the static UI

### Removed from Main View

- Type dropdown → moved to pre-publish dialog
- Tags input → moved to pre-publish dialog
- Featured image URL → moved to pre-publish dialog
- Quality panel sidebar → moved to pre-publish dialog

### Kept in Main View

- Changes-requested banner (if `reviewStatus === "changes_requested"`) — critical context during editing
- Toast messages for save errors
- Slash command popup (already overlays on the editor)

## Section 2: Pre-publish Dialog

When the user clicks "Publish" / "Submit for review", a centered modal dialog appears (`max-w-lg`) with backdrop blur. Closes with Escape or "Back to editing" button.

### Layout Order (top to bottom)

1. **Readiness check** — blocking issues + warnings as a checklist
2. **Outline** — heading structure for a final sanity check
3. **Metadata fields** — type, tags, featured image

### Readiness Check

- Blocking checks shown with green checkmarks (passing) or red X (failing)
- Warning checks shown with orange warning icon
- If any blocking checks fail, the "Publish" button is disabled
- Replaces the current `window.confirm` dialog for warnings

### Outline

- Shows H2/H3 structure with indentation for H3
- Empty state: "No headings yet"
- Gives the writer a quick structural review before committing

### Metadata

- **Type**: Simple select dropdown (article / tutorial)
- **Tags**: Pill-style tags with inline input, same interaction as current but styled cleaner
- **Featured image URL**: Text input with live preview thumbnail below when a valid URL is entered. If empty or invalid, show a dashed-border placeholder

### Action Buttons

- "Back to editing" — text button, left side
- "Publish" / "Submit for review" — primary button, right side, disabled if blocking checks fail

## What's NOT Changing

- All business logic (autosave, save/submit mutations, quality checks, slash commands)
- The Lexical editor configuration and theme
- The write/edit page wrappers (only minor cleanup of the page heading)
- Translation keys (reuse existing ones where possible, add new ones for dialog UI)

## Technical Notes

- No new dependencies needed — the dialog is built with standard HTML/Tailwind (fixed overlay + centered card)
- `ToolbarPlugin` component stays in codebase but is no longer rendered in the main editor view
- Featured image preview uses a simple `<img>` tag with `onError` fallback
- Keyboard shortcut handling for Ctrl+B/I already works via Lexical's built-in commands
