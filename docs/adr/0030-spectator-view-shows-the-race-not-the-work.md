# The Spectator view shows the race, not the work

**Status:** accepted
**Builds on:** [ADR-0024](0024-hackathon-composes-event-and-challenge.md), [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md), [ADR-0021](0021-profile-visibility-governs-member-stack-faces.md)

A [[hackathon]] wants an audience: external visitors and non-participating
members who track the contest from outside. The platform already serves
challenge and event pages to anonymous visitors, so the *access tier* exists.
What is new — and load-bearing — is **what an outsider may see of work that is
otherwise private**. This ADR fixes that line.

## The Spectator view is a public read projection, not a surface

The existing *surfaces* ([[shared-surface]], [[work-cell-surface]],
[[no-go-surface]]) are defined by *where agent output flows*. The **spectator
view** is the opposite: nothing is authored or returned to it, it only *reads*
aggregate hackathon state. So it is deliberately **not** a new surface class —
treating it as one would muddy the surface taxonomy and invite the assumption
that output flows there. It is a public, read-only **projection**.

## Live window: aggregate progress only

During the live window the spectator view exposes the **race, never the work**:
the timeline, the participating teams (faces respecting
[[profile-visibility|`isPublic`]] per [ADR-0021](0021-profile-visibility-governs-member-stack-faces.md)
— private members counted, not shown), and a leaderboard of *aggregate* progress
(verified [[work-cell]] counts / percent, ranked). It **never** exposes a cell's
`output` or any team's cell *content*.

This is two invariants at once:

- **Privacy.** [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md)
  / the work-grid keep cell `output` readable only by the grid admin
  (`requireGridAdmin`). The spectator view is a *separate projection* that selects
  status and counts only; the admin-only gate on `output` is untouched.
- **Competitive integrity.** Rival teams are outsiders to each other's grids too.
  "Aggregate progress only, no work content" protects the contest, not just the
  public — a team cannot scrape a rival's solution from the spectator view.

## After the buzzer: standings open, work stays opt-in

When the hackathon ends the final standings open automatically — that is the
result of a public contest. A team's actual **work or artifact becomes public
only if the team opts to publish it** (the natural [[launchpad]] showcase
plug-in). Output that was admin-only during the hack is **never silently flipped
public at the buzzer**; the team chooses.

## Consequences

- Net-new: a public team-aggregate projection for the hackathon page and a
  team-scoped leaderboard derived from verified-cell counts; both are read-only
  and visibility-respecting.
- **A latent fix is forced:** the existing challenge leaderboard does not filter
  `isPublic` and would leak private participants' faces; the hackathon leaderboard
  must filter it, and the existing one should be corrected to match
  [ADR-0021](0021-profile-visibility-governs-member-stack-faces.md).
- Scope follows the existing community-visibility rule: a spectator view is public
  for Hub-wide and listed-community hackathons, and members-only for an unlisted
  community — no new policy.
- A live activity ticker ("Team Falcon completed a cell") and the post-event
  Launchpad showcase plug-in are **deferred fast-follows**, not part of the
  minimum.

## Rejected alternatives

- **Let spectators (or sponsors) watch a team's cells fill in live with content**
  — leaks competitive work and breaks the admin-only `output` gate; rejected. Only
  aggregate status is live.
- **Open all submissions/outputs publicly when the hackathon ends** — silently
  re-classifies admin-only work as public; rejected in favour of opt-in publishing.
- **Model the spectator view as a fourth surface class** — it consumes no agent
  output and authors nothing; calling it a surface overloads the taxonomy;
  rejected.
- **Inherit the challenge leaderboard's current behaviour** — it ignores
  `isPublic`; rejected, the leak must be fixed, not propagated.

## Amendment — 2026-06-10: a content-free per-cell status heatmap

The original "aggregate progress only" rule treated a team's grid as opaque to
spectators beyond verified-cell counts. This amendment relaxes *granularity*
without touching the privacy line: the spectator view **may now show a
content-free per-cell status heatmap** — the colour/shape of each cell's
progress (its [[work-cell]] [[heat]] state) — alongside the existing aggregate
counts. The heatmap conveys *how far along* each cell is, never *what is in it*.

The "race, never the work" invariant is unchanged. A cell's `output` and any
team's cell *content* stay private to the team and the grid admin exactly as
before. The heatmap exposes status only, so a rival still cannot scrape a
solution from it.

This is realised by **`hackathon.teamHeatmap` returning only `{ heatState }`
per cell** — no `output`, no content, no identifying payload — so the projection
is structurally incapable of leaking work. It is the same kind of read-only,
visibility-respecting projection described above, at finer granularity.
