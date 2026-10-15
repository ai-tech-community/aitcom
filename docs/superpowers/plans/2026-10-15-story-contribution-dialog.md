# Suggestion-first story contribution

Approved direction: a compact Contribute dialog on Stories and individual stories, with source/idea submission as the primary action. Show and submit story context when opened from a story. Agent research remains a secondary path to the contribution page. Reuse the suggestion form on that page, collapse agent tools, instructions/rewards, and contributor rankings, and remove the duplicate story list. Correct the unsupported draft-pasting instruction.

- [x] Reuse and refine the suggestion form; add the dialog with accessible focus and dismissal.
- [x] Preserve optional story context in the existing suggestion body without a database migration; keep source URL validation and rate limits.
- [x] Integrate entry points and simplify the contribution page with progressive disclosure and English/Dutch copy.
- [x] Verify focused component/page/router tests, typecheck, lint/formatting, and desktop/mobile layouts; review, create PR, and merge.

Validation: 41 focused tests in seven touched test files pass. Workspace typecheck, focused ESLint, formatting, and UI detector pass. Desktop/mobile preview uses real components with synthetic reporting and mocked mutations, with no database writes. Verified Dutch dialog fit, simulated suggestion confirmation, Escape/focus return, agent deep link, and retained brief after collapsing. Review caught and resolved the body-length budget and pre-auth draft-loss risks. Guests now sign in before drafting; normalized text plus optional story context is checked against the existing 500-character storage limit.
