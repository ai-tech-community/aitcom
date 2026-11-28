---
status: accepted
---

# The redesign is a UI frame over existing routes

The redesign gives communities a shared frame and makes current workflows easier to find. Members and organizers keep their existing links and actions. [Redesign spec](../superpowers/specs/2026-11-28-open-community-platform-redesign-design.md)

## Decision

Use one deployment-wide flag, `NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES`, to select the rendered frame and screen variants. Both variants use the same URLs, providers, data paths, permissions and side effects. Put the existing forum in the sidebar and render its current screens.

## Consequences

Each slice must preserve the route inventory and workflow parity. Rollback selects the existing UI on the same routes and records. Capabilities that require behavior or data changes belong in separate work.
