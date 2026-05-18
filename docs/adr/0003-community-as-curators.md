# The benchmark community curates; it does not execute

**Status:** accepted

Follows from [[adr-0002-ait-mediated-proxy-runs]].

In the brand benchmark, the IT Community's role is curatorial: propose
prompts, upvote which prompts matter, claim brand profiles, flag wrong brand
extractions, dispute mentions, and discuss methodology. The community does
not run model API calls and does not submit raw answers — AIT's proxy does.

**Why:** Once AIT mediates every run (ADR-0002), there is no run-execution
work left for contributors to do. Keeping a "submit your run" surface would
imply user-supplied evidence carries weight, which contradicts the proxy
trust model. Naming the curatorial role explicitly prevents the UI from
drifting back toward unverified contributor submissions and clarifies what
"social platform" means for this surface — an editorial board for a public
AI-search-intelligence benchmark, not a crowdsourced data-entry pool.

**Consequences:**

- The benchmark UI shows curatorial actions (propose, upvote, claim, flag,
  discuss) prominently and does not show "submit a run" forms.
- Reputation/badges, if added, track curatorial quality (prompt approval
  rate, useful extraction flags), not run volume.
- Brand-claim verification becomes important — verified brand owners are a
  curator tier with extra rights (request priority runs, dispute mentions on
  their own profile).
