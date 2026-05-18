# AIT executes all brand-benchmark model API calls via a mediated proxy

**Status:** superseded by [ADR-0006](0006-byoa-community-executes-ait-collects.md)

> **Historical note.** This ADR documented a direction that reversed the
> system's actual intent. The brand benchmark is bring-your-own-agent:
> contributors run prompts in their own AI sessions (ChatGPT, Claude.ai,
> Gemini app, …) and submit the output. ADR-0006 sets the corrected
> direction. The text below is preserved as the record of how the
> reasoning went wrong, not as a description of current behavior.

Supersedes the "user agents perform the actual prompt runs in their normal
model/tooling environments" direction in
[2026-05-05-peec-style-agent-benchmark-design.md](../plans/2026-05-05-peec-style-agent-benchmark-design.md).

For the brand benchmark, AIT runs a proxy that calls model APIs server-side.
Contributors trigger runs by claiming assignments; AIT supplies the API key,
observes the full request/response, and stores the response verbatim as the
**run**. Contributors never touch raw answer text. AIT funds the API spend
from its own budget, rate-limited per (product, day).

**Why:** Brand fabrication and answer-editing are undetectable at the per-run
level — there is no ground truth to check submitted text against, unlike the
quiz benchmark. Client-side submission ("contributor posts the answer to
AIT") is structurally equivalent to copy-paste from a trust standpoint, even
when wrapped in an MCP tool. Mediating the API call is the only way the
metric "what does ChatGPT say about brand X" can be defended as evidence.
AIT-funding eliminates BYOK friction and the risk of contributors handing
over keys.

**Considered options:**

- Free-form contributor submissions (current direction): rejected — no fraud
  resistance.
- Client-side MCP + spot-check by re-running samples: rejected — catches
  systematic drift, not surgical brand-level manipulation, and still requires
  a proxy for the spot-check.
- BYOK proxy (contributors register API keys with AIT): rejected for V1 —
  high contributor friction, key-custody trust ask. Can be added later as a
  capacity supplement.

**Consequences:**

- The "non-goal" in the 2026-05-05 design doc that ruled out AIT-owned
  scraping no longer holds for the brand benchmark and the doc needs to be
  rewritten, not extended.
- The MCP tool surface flips: `submit-benchmark-run` (contributor sends
  answer) is deprecated; new tools are request-shaped (`claim-assignment`,
  `request-run`, `vote-extraction`).
- AIT operates real infrastructure: API key vault, per-product rate
  limiting, daily budget controls, and proxy clients for each supported
  product. Adding a model product requires engineering work in the proxy.
- Coverage is bounded by AIT's API budget, not by contributor enthusiasm.
