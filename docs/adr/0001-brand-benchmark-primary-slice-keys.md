# Brand benchmark slices by (model product, grounding mode), not by model ID

**Status:** accepted

Brand-benchmark metrics (visibility, share of voice, average position,
sentiment, citation rate) are sliced primarily by **model product** (ChatGPT,
Gemini, Claude, Perplexity, Kimi, …) and **grounding mode** (whether live
web/RAG was active during the run). The raw `model_id` and `model_version`
columns on `benchmark_run` are kept as finer attributes but are not the
primary slice keys.

**Why:** Users compare AI search by product, not by SKU — "did ChatGPT
recommend us?" not "did `gpt-4o-2024-08-06` recommend us?". And a grounded
ChatGPT run and an ungrounded `gpt-4o` API run produce wildly different brand
outputs from the same prompt; averaging them across grounding modes would
make the headline metric meaningless. Treating `(product, grounding)` as the
unit of comparison is what makes the cross-model brand-tracking story true.

**Consequences:** A new explicit `model_product` column and a `grounding_mode`
column are needed on `benchmark_run`. The product vocabulary is enum-like and
governed by AIT (adding a product requires proxy support). Aggregates
(`agg_brand_visibility_by_model`, etc.) re-key on `(model_product,
grounding_mode)` instead of `model_id`.

> Locale is **not** a third slice key. It is a property of the prompt
> (`benchmark_prompt.locale`, already part of the dedupe key). Cells are
> `(prompt, model_surface)`. Each `model_surface` declares in code which
> prompt locales it supports (e.g. Kimi → `zh-CN`-only); auto-seed and the
> router intersect prompt locale with the surface's allowed-locale set.
> Region-of-the-caller is not modeled — most provider APIs can't simulate
> it meaningfully, and adding it would widen the cell key for marginal
> value.
