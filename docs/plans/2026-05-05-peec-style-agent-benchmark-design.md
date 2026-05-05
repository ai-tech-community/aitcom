# PEEC-Style Agent Benchmark Design

Date: 2026-05-05
Status: Approved

## Summary

The benchmark should become a PEEC-style public brand intelligence system, but powered by users' own agents instead of centralized scraping. AIT coordinates prompts, assignments, submissions, extraction, aggregation, and recommendations. User agents perform the actual prompt runs in their normal model/tooling environments.

This keeps the benchmark aligned with AIT's core idea: real AI agents and humans collaborating in the open. The resulting product should show how brands appear across agent-submitted AI answers, which sources shape those answers, and what a brand can do to improve AI search visibility.

## Product Goals

- Make public brand profiles the core benchmark experience.
- Show PEEC-like metrics: visibility, share of voice, average position, sentiment, source visibility, citation rate, competitors, and trends.
- Use user-owned agents as the runners. AIT should guide, validate, and analyze, not centrally scrape every prompt itself.
- Turn benchmark evidence into practical AI Search Optimization recommendations for brands, founders, marketers, researchers, and curious community members.
- Build on the current benchmark tables, MCP tools, citation extraction, brand stats router, and brand page instead of creating a second benchmark system.

## Non-Goals

- AIT-owned crawler agents that automatically run every prompt.
- Paid tenancy or private customer projects in the first version.
- Perfect source attribution across every AI product UI. The first version should improve source capture through agent instructions and schema, then get stricter later.
- Fully automated brand-domain moderation. Brand domain profiles can start simple and become more curated over time.

## Core Flow

1. AIT maintains approved benchmark prompts, topics, tags, categories, brands, and analysis logic.
2. A user connects or registers their own agent through MCP.
3. The benchmark UI gives the user a guided assignment: selected prompts, target model/provider/channel metadata, locale, and source-capture instructions.
4. The user's agent runs those prompts in its normal environment.
5. The agent submits raw answers, model metadata, locale, and source/citation detail back to AIT.
6. AIT extracts brands, rankings, sentiment, citations, source relationships, competitors, and topic coverage.
7. Public brand profiles show metrics, trends, competitors, source intelligence, prompt evidence, and recommendations.

## Brand Profile Experience

The brand profile becomes the main analytics page.

### Hero

- Brand name, website, favicon or fallback avatar.
- Verified status.
- Categories, topics, and tags.
- Main visibility score.
- Delta versus prior period.
- Sample size and window selector.

### Metric Cards

- Visibility.
- Share of voice.
- Average position.
- Sentiment.
- Source visibility.
- Citation rate.

### Trend Charts

- Visibility over time.
- Share of voice over time.
- Sentiment over time.
- Average position over time.
- Optional overlays for top competitors.

### Model And Channel Comparison

Show how the brand performs by submitted model/channel, such as ChatGPT, Claude, Gemini, Perplexity, or API model IDs. The data source remains user-agent-submitted runs.

### Competitors

Competitors should be automatically detected from the same prompt/topic universe:

- Top competing brands by visibility and share of voice.
- Competitor average position.
- Competitor sentiment.
- Competitor source/citation strength.
- Delta versus the subject brand.

### Sources

The source section should become an action layer:

- Top cited domains and URLs.
- Own-site citation rate.
- Source visibility versus brand visibility.
- Competitor source gaps.
- Third-party domains that repeatedly influence AI answers.
- Domains where the brand appears but is not cited strongly.

### Prompts And Topics

Show which prompts and topics explain the metrics:

- Best prompts where the brand performs well.
- Weak prompts where competitors win.
- Missing prompts where the brand does not appear.
- Topic/tag breakdown.
- Prompt-level model comparison.

### Recent Chats And Evidence

Expose the raw evidence in a controlled way:

- Prompt text.
- Raw submitted answer.
- Model/provider/channel metadata.
- Agent/source of submission.
- Locale/country.
- Extracted brands.
- Rank/position.
- Sentiment.
- Citations and source URLs.

## Metric Definitions

### Visibility

Percentage of eligible benchmark runs where the brand is explicitly mentioned.

Formula: `runs mentioning brand / eligible runs`.

### Share Of Voice

The brand's mentions compared with all tracked brand mentions in the same prompt/topic/model/window.

Formula: `brand mention count / total brand mention count`.

### Average Position

Average rank/order when the brand appears. Lower is better. Existing mention extraction already captures `rank`; the implementation should strengthen aggregate support and null handling.

### Sentiment

Positive, neutral, and negative split over mentions. This should be available as both a current-window metric and a trend.

### Source Visibility

Percentage of runs where the brand's owned domains or associated domains appear as sources, even if the answer does not explicitly mention the brand.

### Citation Rate

How often source URLs/domains are explicitly cited in the final answer. The current citation table is a good base, but the design should distinguish explicit citations from source lists whenever agents can submit both.

### Gap Score

Evidence-backed score for where competitors have source, prompt, or visibility advantages that the subject brand lacks.

### Prompt Coverage

How often the brand appears, ranks, or gets cited across prompt categories, tags, countries, models, and time windows.

## Data Model Direction

The current repo already has useful foundations:

- `benchmark_prompt`
- `benchmark_run`
- `benchmark_brand_mention`
- `benchmark_citation`
- `brand`
- brand visibility aggregates
- citation aggregates
- prompt tags
- locale parsing
- MCP benchmark tools
- brand watches
- strategy recommendations

The next phase should extend those foundations.

### Benchmark Assignment

Add a guided assignment entity for user agents.

Suggested fields:

- id
- user id
- agent id, nullable at creation if the user has not selected one yet
- prompt ids
- target provider/model/channel metadata
- locale/country
- status: draft, active, partially complete, complete, expired
- progress counts
- created at
- completed at

### Run Source Detail

Extend source capture beyond basic citations.

Suggested fields:

- run id
- url
- domain
- title
- snippet
- position
- kind: source or citation
- source type: editorial, corporate, user-generated, reference, owned-site, competitor-site, unknown
- brand relation: own, competitor, neutral, unknown
- explicit citation boolean

This can be a new companion table or a compatible extension of `benchmark_citation`, depending on migration risk.

### Brand Domain Profile

Strengthen brand matching and source visibility.

Suggested fields:

- primary domain
- additional owned domains
- aliases
- optional match patterns
- categories/topics
- verification/moderation state

### Aggregate Slices

Fast brand profile charts should be backed by aggregates for:

- brand
- competitor
- prompt
- category/topic/tag
- model/channel
- country/locale
- date
- assignment/run source

## Recommendation Engine

The brand page should include an AI Search Optimization panel that turns benchmark evidence into practical actions.

This should be a first-class differentiator. PEEC-style analytics explain what happened; AIT should also explain what to do next.

### Recommendation Categories

- Content gaps: prompts where competitors appear but the brand does not.
- Source gaps: domains that AI systems cite for competitors but not for the brand.
- Authority gaps: sources that mention the brand but do not cause strong citation or ranking.
- Owned-site gaps: cases where the brand appears but its own website is not cited.
- Prompt/topic opportunities: categories with weak visibility but strong brand fit.
- Sentiment fixes: recurring negative or lukewarm context.
- Position improvements: prompts where the brand appears but ranks below competitors.

### Recommendation Shape

Each recommendation should include:

- title
- priority
- why
- evidence
- suggested action
- related prompts
- related competitors
- related sources/domains
- expected metric impact

### Grounding Approach

Generate deterministic insight candidates from benchmark data first, then ask an LLM to synthesize and prioritize them. The LLM should not invent evidence. It should turn structured insight candidates into useful SEO/GEO recommendations.

The existing `generateStrategy` path can evolve into this grounded system.

## Agent Contribution Workflow

The benchmark should not depend on AIT-owned agents running everything. Instead:

- Users use their own agents.
- AIT gives them a clear assignment.
- MCP tools tell agents exactly how to run prompts and preserve raw answers/sources.
- Submissions remain one run per prompt/model/day unless assignment-specific rules require a different cap.
- Assignment progress gives users a reason to complete the batch.

The existing `list-benchmark-prompts` and `submit-benchmark-run` tools should be improved with:

- source and citation preservation instructions
- optional assignment id
- richer model/channel metadata
- clearer guidance on submitting the full raw answer, including source blocks

## Rollout

1. Improve brand profile metrics and charts using existing aggregates where possible.
2. Upgrade source/citation capture and source classification.
3. Add the grounded recommendation engine.
4. Add guided benchmark assignments for user agents.
5. Improve MCP benchmark tool descriptions and inputs.
6. Add remaining aggregate slices for PEEC-style trend and comparison charts.

## Risks

- Low data volume can make PEEC-style charts misleading. The UI should always show sample size and low-data warnings.
- Source capture depends on agents preserving the answer's citation/source blocks.
- Auto-created brands can duplicate canonical brands. Better domain/alias moderation will matter.
- Recommendations can become generic if they are not grounded in deterministic evidence.
- Country/model/channel comparisons need consistent metadata from submissions.

## Success Criteria

- A public brand page feels like a credible PEEC-style analytics profile.
- A user can give their own agent an AIT assignment and produce useful benchmark runs.
- Brand metrics can be sliced by model/channel, prompt/topic, country, and time window.
- Recommendations cite concrete prompts, competitors, and source domains as evidence.
- The system remains open/community-driven rather than centralized around AIT-owned crawlers.
