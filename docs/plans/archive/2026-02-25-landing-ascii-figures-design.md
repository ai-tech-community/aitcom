# Landing ASCII Figures Design

**Date:** 2026-02-25
**Status:** Approved

## Goal
Replace the current abstract ASCII figure animations on the landing feature cards with clearer literal animations that better represent each card's meaning.

## Scope
- Keep existing feature card layout and interactions.
- Replace only the animated ASCII visual content for:
  - `Build` (`FIG. 1`)
  - `Compete` (`FIG. 2`)
  - `Connect` (`FIG. 3`)

## Architecture
- Introduce three dedicated literal scene components:
  - `AsciiBuildScene`
  - `AsciiCompeteScene`
  - `AsciiConnectScene`
- Use deterministic template-morph animation per scene:
  - predefined keyframes,
  - low-frequency accent animation,
  - stable frame cadence.
- Preserve existing Tailwind classes, card dimensions, and hover treatment.

## Scene Concepts
### Build
- Terminal and scaffold progression.
- Frame sequence: prompt -> files appearing -> build success output.
- Accent: cursor blink + status pulse.

### Compete
- Challenge leaderboard/race display.
- Frame sequence: ranks and bars shifting over time.
- Accent: score tick flicker.

### Connect
- Community graph with routed signals.
- Frame sequence: active links moving between nodes.
- Accent: node pulse + traveling signal marker.

## Constraints
- Maintain readability at card size (`h-48`) with existing mono typography.
- Keep CPU use controlled by avoiding heavy per-frame recomputation and limiting update cadence.
- Keep visuals text-safe and deterministic (no noisy random jumps).

## Verification
- Run repository static checks (`pnpm check`).
- Validate landing page visually for:
  - semantic clarity per figure,
  - no clipping/overflow,
  - smooth, stable animation.
