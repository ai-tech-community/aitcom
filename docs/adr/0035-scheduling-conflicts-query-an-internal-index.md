# Scheduling conflicts query an internal curated event index, never live external APIs

**Status:** accepted

The event scheduling conflict-check (advisory warnings + suggested time slots
in the event creation flow, monitoring of already-scheduled events) computes
conflicts exclusively against **our own `events` collection** — native events,
events from connected Luma calendars, URL imports, and agent-discovered
external events flowing through the existing curation pipeline
(`discoverySource`, `curatedByAgent`, `reviewStatus`). It never fans out to
Luma/Meetup/Eventbrite at check time. External coverage is an **ingestion
problem**, not a query problem: a discovered event must be classified into the
Hub-global Audience vocabulary (by the curating agent, gated by the ADR-0011
human review queue) before it can participate in conflict detection at all.

**Why:** The instinct is to "check against Luma, Meetup, Eventbrite" live —
but the required APIs largely do not exist. Eventbrite retired its public
event-search API; Meetup's GraphQL API is gated behind a Pro subscription;
Luma's public API only reads calendars you hold a key for (which is exactly
what our per-community integration already does). Beyond feasibility, the
conflict rule needs graded severity over shared Audiences, time proximity, and
catchment — which requires external events to be *normalized and
audience-classified in advance*, something a live third-party response can
never carry. An internal index makes the check a fast local query with a
uniform vocabulary, at the cost of coverage honesty: the corpus only knows
what has been ingested, so the UI must say "based on events AIT knows about"
rather than implying omniscience.

**Rejected alternatives:**

- **Live API fan-out at creation time.** Blocked by the API landscape above,
  and would put third-party latency and rate limits inside a keystroke-debounced
  form interaction. Declined.
- **Organizer-maintained watchlists only.** High precision, no discovery
  infrastructure, but coverage depends on organizers doing homework — the
  feature's value is telling them what they *don't* already know. Kept only as
  one ingestion channel (URL import), not the strategy. Declined as the corpus.
- **Our published events only.** Fails the motivating case: the competing CEO
  events live on external platforms. Declined.

**Consequences:**

- Coverage grows over time and is honest from day one (phase 1 corpus: native
  + connected Luma + URL imports; agent-scale discovery follows).
- Unpublished native drafts participate as anonymized **tentative holds**, so
  two on-platform organizers cannot collide blind — possible only because the
  index is ours.
- Discovered events need freshness handling (`lastVerifiedAt`,
  `confidenceScore`) — a stale cancelled event is a false-positive conflict,
  which is why the check is advisory and never blocks submission.
