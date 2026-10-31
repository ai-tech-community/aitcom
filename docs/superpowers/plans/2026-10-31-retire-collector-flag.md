# Retire the collector rollout flag

The owner requested removal after completion of the approved collector roadmap.
The parent design already calls for deleting the rollout flag once final.

Collectors become a permanent authenticated dashboard feature. Remove
`FEATURE_COLLECTORS`, `collectorsEnabled()`, the conditional tab prop and the
facade's global enabled dependency and disabled result. Pages retain session
checks; web, staff and MCP retain their existing permission, ownership and quota
checks. Exports retain authentication and run-state checks; workers retain their
cron secret. `COLLECTORS_DISABLED`, domain opt-outs and network guards stay.

1. Remove runtime gates from dashboard/pages, tRPC/facade, exports and workers;
   delete the env schema/example entry and update current setup guidance.
2. Replace rollout-off tests with permanent availability and retained-access
   checks; update facade fixtures, without running integration tests.
3. Run only changed unit files, workspace type-check and changed-file lint and
   formatting. Independently review the fixed diff, commit, publish and merge
   after CI under the owner's standing autonomous collector-delivery request.

No database commands, production build or real persisted runs are part of local
verification. Preserve the owner's unrelated `src/payload-types.ts` changes.

## Verification

- Thirteen changed/added unit files: 136 tests passed.
- Workspace `pnpm typecheck` and lint of changed TS/TSX/JS files passed.
- Remaining source references to the retired env name are two deliberate
  regressions proving a stale `off` value no longer disables worker execution.
- The existing integration fixture drops the obsolete enabled dependency and
  feature-off expectation; no integration test or database command was run.
- The owner's Payload type diff remains byte-for-byte unchanged and unstaged.
