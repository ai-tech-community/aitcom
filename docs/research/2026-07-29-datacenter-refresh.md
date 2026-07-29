# AI datacenter investigation — data refresh, 2026-07-29

**Research window:** 2026-04-28 → 2026-07-29
**Previous refresh:** 2026-04-28 (the "Phase 6.1" WebFetch audit)
**Source appendix:** [`2026-07-29-datacenter-refresh-sources.json`](./2026-07-29-datacenter-refresh-sources.json)

The investigations dataset had not been updated in three months. This document records
what the refresh added, what it corrected, what it could not establish, and the defects it
exposed in the data that was already there.

---

## 1. What landed

New records, in [`src/scripts/seed-data/refresh-2026-07.ts`](../../src/scripts/seed-data/refresh-2026-07.ts):

| Dataset | Records |
| --- | ---: |
| Datacenter sites | 114 |
| Brands / operators | 89 |
| Permits | 18 |
| Subsidies awarded | 5 |
| Subsidies refused | 3 |
| Capex figures | 10 |
| Renewable commitments | 2 |
| Ownership edges | 17 |
| Supplier links | 4 |

Backed by **399 source entries across 375 distinct URLs** — 169 classified primary
(operator newsroom, SEC filing, planning portal, government release), 230 secondary.
352 were fetched successfully; 45 were blocked by the publisher, 1 returned 404, 1 was
paywalled. No field value rests on an unreadable source alone.

The 114 sites span **29 countries** (US 53, then Norway, Malaysia, India, France, Italy,
the UK), and break down as 69 announced, 31 under construction, 5 operational, 4 expanding,
and **7 cancelled**. 67 are AI-dedicated. 68 carry a capacity figure totalling roughly
**40.7 GW planned**; the other 46 have no capacity because no source stated one, and a blank
was preferred to an estimate.

Of the 114, **26 are deliberately sparse stub records**. They exist because permits and
subsidies were found for sites the dataset did not track — without a parent row, those
findings could not be loaded at all.

---

## 2. Method

Eight research agents ran in parallel, each scoped to one area, sharing one brief with the
exact TypeScript types so output could be validated mechanically rather than read by eye.

Every agent's knowledge cutoff precedes the research window, so none could answer from
memory; each record had to come from a page fetched during the run.

Three checks gate the data:

1. **Every record carries at least one source**, and every URL cited by a record must also
   appear in that agent's source appendix. A fabricated citation has no fetch record behind
   it, so it fails this check.
2. **Slug collision detection**, exact and token-similarity. Exact matching alone is not
   enough — `microsoft-mount-pleasant-wi` and `microsoft-mt-pleasant` are the same site.
3. **Cross-agent reconciliation**, because agents working independently find the same site
   under different slugs and attach child records to a parent that arrived under another name.

The batch passes with zero validation errors.

### The rejected batch

The APAC agent's first output cited Data Center Dynamics **search-listing pages**
(`?term=asia-pacific&page=2`) as sources for 17 of 31 records. A search listing is a
discovery tool: its contents change over time, so the citation is not reproducible, and it
evidences nothing about a specific site. That batch was rejected and re-researched.

The second pass replaced 6 records with real sources, deleted the listing URL from 11 whose
remaining source already carried the claim, and corrected figures throughout. Most
significantly, it found that one record's entire power story — a 20-year US$2bn energy
deal, a named 630 MW wind complex, a US$39bn investment figure — **appeared in no
retrievable source** and removed it.

That is the failure mode this pipeline exists to catch, and it was caught by verification,
not by the original research.

---

## 3. Principal findings

### Two climate pledges quietly weakened

**Microsoft has dropped its 2030 clean-energy target without announcing it.** Comparing the
2025 and 2026 sustainability report PDFs directly: the commitment that "by 2030, 100% of our
electricity consumption will be matched by zero carbon electricity purchases 100% of the
time" appears in the 2025 report and is absent from the 2026 one, published 2026-07-09. No
forward percentage-and-year energy target replaces it, and the endnotes now refer to "our
2025 100% renewable target" in the past tense.

**Meta left RE100** after roughly a decade, confirmed 2026-07-23 and verified against the
Climate Group's live member list, which no longer carries Meta or Facebook while Microsoft,
Google, Iron Mountain, Telefónica and KDDI remain. Meta's claim is now a year-less "match
100% with renewable energy".

Google moved the other way, reaffirming 24/7 carbon-free energy by 2030 in its 2026
Environmental Report, though with softened framing and flat progress (~65%).

### Refusal is now a normal outcome

Of 18 permits recorded, **8 were denied and 1 withdrawn**. Seven sites are recorded with
status `cancelled`. This is a deliberate emphasis: a dataset that captures only approvals
would misrepresent the planning landscape.

- **New Mexico** denied Energy Transfer's rights-of-way and business lease on state trust
  land for a second time (2026-07-14), citing greenhouse gas emissions and water use, which
  strands Oracle's ~2.5 GW "Project Jupiter" campus from its gas supply.
- **Hanover County, Virginia** killed Tract's 427-acre campus 4–3, rejecting both the
  rezoning and the substation permit, over 0.6–2.0 million gallons/day of water.
- Citrus County FL, Douglas County GA, Tyler TX and Pocatello ID all refused permits.
  Archer County TX and Columbiana AL refused *subsidies*, both unanimously.
- **QTS withdrew** its appeals for the PW Digital Gateway in Prince William County VA — up
  to 27 million sq ft.

One case shows local refusal being routed around: Boulder City NV's Planning Commission
denied the Townsite Solar 2 datacenter on 2026-05-20; the developer withdrew, and BLM
approved an *amendment* to the existing 2023 solar right-of-way on 2026-06-26, reusing the
earlier environmental review instead of conducting a new one.

### The subsidy-per-job arithmetic

- **Ohio** granted Cologix $42.3m of sales-tax forgiveness for **90 permanent jobs**
  (~$470,000 per job) on 2026-06-02 — the last such exemption before the Governor paused the
  programme indefinitely. Ohio's cumulative datacenter exemption cost since 2025 had reached
  roughly $2.17bn.
- **Van Buren Township, Michigan**: ~$125m over 12 years to Google for a 1 GW campus with a
  floor of **51 permanent jobs**.
- **Saline Township, Michigan** reversed itself three times in two weeks on a 12-year/50%
  abatement for Related Digital's "The Barn" (hosting Oracle and OpenAI): rejected
  2026-07-08, approved 2026-07-14 but capped at the $4.8bn consent-judgment valuation rather
  than the current $43bn, then the cap was removed around 2026-07-21 after the township
  attorney warned it breached a 2025 consent judgment. Under the cap the break was worth
  under $20m/yr against an ask of ~$147m/yr.

### Compute buildout

- **OpenAI is building its own campus.** "Project Camellia" — 3.2 GW, 1,400 acres, four
  buildings, Effingham County, Georgia, announced 2026-07-22, with Georgia Power delivering
  in phases 2028–2032 under a 25-year agreement. The first OpenAI-developed site in the
  dataset.
- **Anthropic** signed a 20-year, 401 MW lease with TeraWulf at Hawesville, Kentucky
  (~$19bn contracted), from an SEC filing.
- **SoftBank** announced 5 GW in France — up to €75bn, with a €45bn first phase for 3.1 GW
  across Dunkirk (Loon-Plage), Le Bosquel and Bouchain by 2031.
- **Microsoft and Chevron** are co-locating a 2.67 GW dedicated gas plant with a ~2 GW
  Microsoft campus at Pecos, Texas under a 20-year PPA.
- **The Nordics took six large sites in ten weeks** — atNorth Haugaland (350 MW), Arcem
  Joroinen (500 MW), Pure DC Seinäjoki (550 MW), AmpTank Utajärvi (200 MW), Bulk Arendal,
  Microsoft Sandnes.
- **Crypto-to-AI conversion is now also a rebrand wave**: Bitfarms → Keel Infrastructure,
  Cipher Mining → Cipher Digital, Digihost → Digi Power X, Mawson → Big Digital Energy.

### No public operator disclosed per-site capex

Across the entire window, **not one publicly listed datacenter operator disclosed a
per-site capital expenditure figure in an SEC filing.** Every large site-linked number was
contracted lease revenue, senior secured notes, or an equity raise:

- Applied Digital's $7.5bn / $5.2bn figures are 15-year contracted lease revenue; its
  $2.15bn and $1.59bn are debt.
- IREN's $9.7bn Microsoft and $3.4bn NVIDIA numbers are contracts.
- Galaxy Digital's $3.507bn and Cipher's ~$2bn are notes.

Only 10 capex records survived that filter. This is itself a finding: the headline numbers
in circulation are mostly not construction spending.

---

## 4. Defects found in the existing dataset

The refresh surfaced problems that predate it.

1. **`meta-temple` and `meta-temple-tx` are the same site**, seeded twice from `na.ts` and
   `ai-native.ts` with identical coordinates (31.0982, -97.3428) but conflicting values:
   240 MW vs 700 MW planned, air vs direct-to-chip cooling, `aiDedicated` false vs true.
   `dedupeDatacenters()` compares slugs only, so both rows insert.

   Checking against Meta directly: **both source URLs are dead (404)**, and **Meta publishes
   no megawatt figure for Temple at all**. Neither capacity was ever sourced. Meta's own
   one-pager gives $1.2bn, two buildings, 760,000+ sq ft, ~100 operations roles, Oncor power.
   The site went live on 2026-07-22 as the first to open with Meta's AI-optimised design —
   a fact inside our window that no agent caught.

2. **13 sites are defined twice** across the seed files under the same slug
   (`coreweave-las-vegas-lv1`, `equinix-dc2-ashburn`, `qts-irving-tx` and 10 others). The
   database is unaffected, since dedupe keeps the first, but the source files contradict
   themselves and the second definition is silently dead.

3. **2 child records point at datacenters that do not exist**: permits and suppliers
   reference `meta-sarpy-county` and `apple-maiden-nc`, where the real slugs are
   `meta-sarpy-county-ne` and something else entirely. `seed-investigations.ts` reports
   missing slugs at the end of its run, so this was visible but unnoticed.

4. **The `subsidy` table has no status column.** A refused abatement cannot be stored
   without looking like an award. Three refusals are therefore held in
   `REFRESH_2026_07_REFUSED_SUBSIDIES` and **are not seeded**. Losing them would leave only
   the approvals.

---

## 5. Conflicts resolved

Eleven, each recorded with its reason in
[`2026-07-29-refresh-resolutions.json`](./2026-07-29-refresh-resolutions.json):

**Two proposed sites were really updates**, caught by similarity matching at 0.91:
`microsoft-mount-pleasant-wi` → existing `microsoft-mt-pleasant` (now operational), and
`meta-hyperion-richland-parish-la` → existing `meta-hyperion-richland` (expanding to 5 GW).
Both were removed from the insert set and applied via the update script instead.

**Three sites were found twice by different agents.** In each case the better-sourced record
was kept and sources from both were unioned:

- BUZZ HPC Toronto — the two agents disagreed on the operator, one naming BUZZ HPC and the
  other its parent HIVE Digital. The disagreement was itself a finding: an ownership edge
  `hive-digital → buzz-hpc` was added.
- Applied Digital Boyce, Louisiana.
- Nscale Narvik, Norway — kept the record naming Bjerkvik, the actual location.

**Five child records were re-pointed** to a parent that arrived under a different slug
(for example a permit filed against `stack-berry-hill-pittsylvania-va` where the site agent
had created `stack-berry-hill-va`).

---

## 6. Known gaps

- **Virginia air permits are absent entirely.** Virginia DEQ's "Issued Air Permits for Data
  Centers" page refuses automated retrieval. For the largest datacenter market in the world,
  this is the single biggest hole and warrants a manual pull.
- **No SEC filing or competition-authority document was read directly for ownership.** EDGAR
  blocked that agent, so all 17 ownership edges rest on company press releases.
- **Supplier coverage is thin** — 4 records. Transformer and turbine supply is visibly
  constrained (Hitachi Energy air-freighting 80-tonne transformers; Generac's June hyperscaler
  agreement; a 5 GW ON.energy/Prolec GE deal) but in every case the customer or site is
  undisclosed, so nothing could be attached to a slug.
- **Data Center Dynamics blocks automated fetches** and is the sole original for several
  stories; where used, the block is recorded honestly in the appendix.
- **~15 European leads** were identified but not chased before the search budget ran out.
  They are named in the appendix notes for a follow-up run.
- **Moratoriums are unrepresentable.** Montgomery County MD, Hillsboro OR, Lansing MI,
  Singapore, Amsterdam, Dublin and ~30 others are jurisdiction-level policy with no
  `datacenterSlug`, and the schema has nowhere to put them. They are arguably the most
  consequential permitting story of the period.

---

## 7. How to load this

Nothing has been written to any database. `DATABASE_URL` in `.env` points at production, so
loading is a deliberate, separate act.

```bash
# 1. New records. Idempotent: skips slugs that already exist.
pnpm datacenters:seed
pnpm investigations:seed

# 2. Corrections to existing rows. DRY RUN FIRST — prints a field-level diff.
pnpm dlx tsx --env-file=.env src/scripts/apply-datacenter-updates.ts
pnpm dlx tsx --env-file=.env src/scripts/apply-datacenter-updates.ts --apply
```

The update script is the new half. `seed-datacenters.ts` is insert-only and can never
correct a site that changed after it was first seeded; `apply-datacenter-updates.ts` applies
field changes with their justifying sources, and merges duplicate rows by re-pointing every
child record onto the survivor before deleting the loser.

It currently carries three updates (Mount Pleasant → operational, Hyperion → expanding at
5 GW, Temple → operational and AI-dedicated with corrected capacity and capex) and one merge
(`meta-temple-tx` → `meta-temple`).

---

## 8. Follow-ups

1. Add a status/decision column to `subsidy` so refusals can be stored, then seed
   `REFRESH_2026_07_REFUSED_SUBSIDIES`.
2. Pull Virginia DEQ air permits manually.
3. Fix the 2 dangling child references (`meta-sarpy-county`, `apple-maiden-nc`).
4. Remove the 13 duplicate slug definitions from the seed files.
5. Consider a `jurisdiction_policy` table for moratoriums and statewide programme pauses,
   which currently have nowhere to live.
6. Re-verify the existing 266 records. This refresh only added new ones; the pre-existing
   rows were last checked on 2026-04-28, and the Temple case shows how badly a stale record
   can drift.
