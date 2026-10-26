# Community magazines platform content slice — rulings made during execution

Decisions taken on the owner's behalf while building the platform content slice,
in order. Core ruling F14 applies to the drift guard.

## Rulings during execution

- Ruling: F14 (Task 4) guard all magazine block tables together: `magazine_issues_blocks_article`, `magazine_issues_blocks_editorial` and `magazine_issues_blocks_storyline`. A read-only verification against `aitcom_test` on `127.0.0.1:55432`, with Payload push unset, checked these alongside the existing guarded tables before they were added. Output: `db-verify-payload-schema: OK (payload_locked_documents_rels, hosted_materials, magazines, magazine_issues, articles, _articles_v, magazine_issues_blocks_article, magazine_issues_blocks_editorial, magazine_issues_blocks_storyline)`; no missing columns. The storyline migration had first passed its up-twice and down/up DB tests. Later kind tasks guard their new block table too, after its migration is applied and the read-only check passes — cost if wrong: a deploy drift-check failure, fixed by removing all block-table entries together.
