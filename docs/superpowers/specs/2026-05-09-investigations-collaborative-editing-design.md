# Investigations: Collaborative Editing & Dispute Layer

**Date:** 2026-05-09
**Status:** Design

## Goal

Let registered users add and update any investigation-system data at any time, with a feedback loop where other users can mark edits true or false, and expose the same capabilities to agents through MCP.

## Background

The investigations area covers community research on the AI economy: datacenters, operators (brands), suppliers, ownership chains, subsidies, permits, energy deals, status history, and findings. Today most of this data is loaded by seed scripts. A handful of write procedures exist (`submit` for datacenters, `addSupplier`, `createBrand`, `submitFinding`, `upvoteFinding`), but there is no general-purpose editing path, no edit history, no dispute mechanism, and no agent-facing surface for any of it. As a result the dataset cannot evolve without engineer intervention, and there is no way for the community to challenge a fact.

This spec adds a uniform editing layer over all writeable investigation entities, a feedback path that lets humans flag edits as true or false, an admin tiebreak for contested edits, and an MCP surface so agents can propose edits with sources.

## Decisions locked during brainstorming

| # | Topic | Decision |
|---|-------|----------|
| 1 | Scope | All writeable entities: datacenter, brand, ownership edge, subsidy, permit, energy deal, datacenter–supplier link, datacenter status history, datacenter finding. |
| 2 | Moderation model | Auto-publish with a dispute layer. Edits go live immediately; community feedback can move an edit into a contested state. |
| 3 | Feedback granularity | Edit-level. Each individual edit is the unit voted on. Pairs with the audit trail and makes revert atomic. |
| 4 | MCP scope | Agents can read and propose edits, but cannot vote. Voting stays human-only to limit sybil pressure. |
| 5 | Source citations | Required for every new row and for every update that touches a field marked factual. Cosmetic edits do not require sources. |
| 6 | Dispute resolution | Threshold count of false votes flips an edit to `contested`. An admin then accepts or reverts. |
| 7 | Audit trail storage | Single polymorphic `investigation_edit` table covering all entity types, with a sparse `before` / `patch` snapshot of touched fields. |
| 8 | Anti-spam | Per-user rate limits on edits and votes, plus admin tools for mass-revert and ban. Existing email-verified login is implicit baseline. |
| 9 | Field-level perms | Admin-only: `verified` flag on brands and datacenter-supplier links, finding `status`, slug edits on any entity, and deletes. Everything else is community-editable. |
| 10 | Write integration | Service-layer wrapper. All writes — HTTP and MCP — go through `recordedCreate` / `recordedUpdate` / `recordedDelete` helpers, which enforce rate limit, citation rule, field whitelist, admin-only fields, and produce the edit log row plus the canonical row update in a single transaction. |

## Architecture

```
┌──── HTTP (tRPC, protectedProcedure) ────┐
│                                          ├──► recordedUpdate(entity, id, patch, sources, ctx)
│         MCP (registerInvestigationTools) │            │
└──────────────────────────────────────────┘            │
                                                         ▼
                          ┌──── enforce: rate limit, cite rule, field perms ───┐
                          │                                                     │
                          │  INSERT investigation_edit (before, after, status) │
                          │  UPDATE canonical row                              │
                          │  enqueue notify(watchers)                          │
                          └─────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
                          ┌── Vote path (separate proc) ─────────────────────────┐
                          │  voteEdit(editId, true|false, ctx) — humans only      │
                          │  on N false → edit.status='contested', notify admin   │
                          └──────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
                          ┌── Admin tiebreak ────────────────────────────────────┐
                          │  resolveEdit(editId, accept|revert, reason)           │
                          │  revert: re-apply edit.before to canonical, append    │
                          │  reverse-edit row (audit chain unbroken)              │
                          └──────────────────────────────────────────────────────┘
```

The wrapper is the only path that writes to investigation tables. Existing direct-write procedures (`submit`, `addSupplier`, `submitFinding`, `createBrand`) are refactored to call it. New procedures for the broader entity set follow the same pattern.

## Data model

Two new tables in `appSchema`. All canonical investigation tables stay as-is.

```ts
// investigationEdit — single polymorphic edit log
export const investigationEdit = appSchema.table("investigation_edit", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
    // 'datacenter' | 'brand' | 'subsidy' | 'permit' | 'energy_deal'
    // | 'ownership_edge' | 'datacenter_supplier'
    // | 'datacenter_status_history' | 'datacenter_finding'
  entityId: text("entity_id").notNull(),
    // uuid string for single-uuid entities;
    // for composite keys, deterministic serialized form (see below)
  op: text("op").notNull(),                    // 'create' | 'update' | 'revert'
  patch: jsonb("patch").$type<Record<string, unknown>>().notNull(),
  before: jsonb("before").$type<Record<string, unknown>>(),  // null on create
  sources: jsonb("sources")
    .$type<{ url: string; title?: string; type?: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "set null" }),
  agentId: text("agent_id"),                   // null for human, set for MCP edits; references agent_profile.id (varchar 255)
  status: text("status").notNull().default("live"),
    // 'live' | 'contested' | 'reverted' | 'accepted'
  trueVotes: integer("true_votes").notNull().default(0),
  falseVotes: integer("false_votes").notNull().default(0),
  revertedByEditId: uuid("reverted_by_edit_id"),
  resolvedByUserId: text("resolved_by_user_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  entityIdx: index("inv_edit_entity_idx").on(t.entityType, t.entityId),
  userIdx: index("inv_edit_user_idx").on(t.userId),
  statusIdx: index("inv_edit_status_idx").on(t.status),
  createdIdx: index("inv_edit_created_idx").on(t.createdAt),
}));

// investigationEditVote — per-user vote on an edit
export const investigationEditVote = appSchema.table("investigation_edit_vote", {
  editId: uuid("edit_id")
    .notNull()
    .references(() => investigationEdit.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  vote: integer("vote").notNull(),    // +1 true, -1 false
  reason: text("reason"),             // required when vote = -1 (proc-enforced)
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  pk: uniqueIndex("inv_edit_vote_pk").on(t.editId, t.userId),
}));
```

Notes:

- `entityId` is `text`, not `uuid`, so composite-key entities can be addressed with a deterministic serialization (e.g. `datacenter_supplier` PK `(datacenterId, supplierId, category)` becomes `"<dcId>|<supId>|<category>"`). Single-uuid entities use the uuid string. The serializer is centralized in the entity config.
- `before` is sparse — it only stores values for fields the edit actually touches. Revert applies `before` back as a patch to the canonical row.
- `agentId` is set when the edit comes through MCP, in addition to `userId` (the key owner). Human edits leave `agentId` null.
- `status='live'` always corresponds to an edit whose effect is currently in the canonical row. `accepted` means an admin reviewed and explicitly endorsed; `reverted` means the edit was undone and a reverse-edit row exists.

## Service layer

`src/server/investigations/recorded-write.ts` exposes:

```ts
type EntityType =
  | 'datacenter'
  | 'brand'
  | 'subsidy'
  | 'permit'
  | 'energy_deal'
  | 'ownership_edge'
  | 'datacenter_supplier'
  | 'datacenter_status_history'
  | 'datacenter_finding';

interface RecordedWriteCtx {
  userId: string;
  agentId?: string;
  isAdmin: boolean;
  db: typeof db;
}

interface Source {
  url: string;
  title?: string;
  type?: 'news' | 'pr' | 'filing' | 'permit' | 'operator' | 'other';
  publishedAt?: string;
}

recordedCreate(ctx, { entityType, values, sources })
  → { entity, edit }

recordedUpdate(ctx, { entityType, entityId, patch, sources, reason? })
  → { entity, edit }

recordedDelete(ctx, { entityType, entityId, reason })   // admin-only
  → { edit }

revertEdit(ctx, editId, reason)                          // admin-only
  → { edit, reverseEdit }
```

A per-entity `ENTITY_CONFIG` table declares for each entity type:

- The canonical Drizzle table.
- The primary-key column or composite-key serializer.
- `factualFields` — set of field names that require sources on update.
- `adminOnlyFields` — set of fields that 403 unless `isAdmin`.
- `editableFields` — explicit whitelist; any field outside it 400s.
- An optional watcher source (currently the prior-author set on the entity) used for notifications.

Example for `datacenter`:

```ts
{
  table: datacenters,
  pkColumn: 'id',
  factualFields: new Set([
    'capacityMw', 'powerSource', 'cooling',
    'operatorId', 'utilityId',
    'lat', 'lng',
    'onlineAt', 'groundbreakAt', 'announceAt',
  ]),
  adminOnlyFields: new Set(['verified', 'slug']),
  editableFields: new Set([/* factualFields + name, description, country, region, etc. */]),
}
```

Wrapper enforcement order, inside a single transaction:

1. Rate limit — per-user sliding window. Uses an existing rate-limit table if present, otherwise adds `rate_limit_bucket`.
2. Field whitelist — reject any field not in `editableFields`.
3. Admin-only field check — 403 if any field in `adminOnlyFields` and `!isAdmin`.
4. Citation rule — required on `op='create'` and on `op='update'` when `patch` touches any `factualFields`. Otherwise optional.
5. `before` snapshot — `SELECT` the touched fields from the current row.
6. `INSERT investigation_edit` with `status='live'`.
7. `INSERT` or `UPDATE` the canonical row.
8. Enqueue notification (see below).
9. Return `{ entity, edit }`.

Existing procedures `datacenters.submit`, `datacenters.addSupplier`, `datacenters.submitFinding`, `datacenters.createBrand` are refactored to call the wrapper. Their external behaviour is preserved; only the implementation moves through the service.

## Voting and dispute resolution

New tRPC procedures, all `protectedProcedure` unless noted:

```
investigations.editFeed                       — list edits, filter by entity/status/author
investigations.editById                       — single edit detail with before/after, votes, sources
investigations.editsForEntity({entityType,entityId})
investigations.myEdits                        — current user's edit history
investigations.voteEdit({ editId, vote: 'true'|'false', reason? })

// admin-only
investigations.resolveEdit({ editId, decision: 'accept'|'revert', reason })
investigations.banUser({ userId, reason })
investigations.massRevert({ userId, since? })
```

`voteEdit` rules:

1. Rate limit on votes per user.
2. Reject if `userId === edit.userId` (no self-vote).
3. Upsert `investigation_edit_vote`; users may change their vote.
4. Recompute `trueVotes`, `falseVotes` on the edit row.
5. If `falseVotes >= FALSE_THRESHOLD` and `status='live'` → set `status='contested'` and notify admins.
6. If `falseVotes < FALSE_THRESHOLD` and `status='contested'` (vote was withdrawn) → flip back to `live`.

`resolveEdit` rules:

- `accept`: set `status='accepted'`, fill `resolvedByUserId`/`resolvedAt`. Canonical row is unchanged because the edit is already applied.
- `revert`:
  - Read `edit.before`.
  - Apply `before` back to the canonical row (or `DELETE` the row if `op='create'`).
  - Insert a new `investigation_edit` row with `op='revert'`, `revertedByEditId` pointing to the original.
  - Set the original edit's `status='reverted'`, `resolvedByUserId`/`resolvedAt`.
- Notify the original edit's author either way.

Defaults, surfaced as constants and overridable via env or settings:

```
FALSE_THRESHOLD  = 3
EDIT_RATE_LIMIT  = 20 / hour
VOTE_RATE_LIMIT  = 60 / hour
```

Frontend implications (separate plan): on every entity page, render a "Recent edits" panel showing the edit feed with vote buttons; render contested edits with a visible warning state; provide a `reason` input that is required on a false vote.

## MCP integration

New file: `src/app/api/mcp/investigation-tools.ts`, registered alongside existing tool packs in `src/app/api/mcp/route.ts`.

Read tools (8):

- `list-datacenters` — filter by country, operator, status, verified
- `get-datacenter` — slug → full row plus suppliers, energy deals, subsidies, permits, status history
- `get-operator` — brand by slug → datacenters operated, ownership chain
- `get-supplier` — brand by slug → datacenters supplied
- `list-subsidies` — filter by jurisdiction, recipient, datacenter
- `list-permits` — filter by datacenter, kind
- `list-ownership-edges` — filter by parent, child
- `list-edits` — filter by entityType, entityId, status, author

Write/propose tools (11):

- `propose-datacenter`, `update-datacenter`
- `propose-brand`, `update-brand`
- `add-datacenter-supplier`
- `propose-subsidy`, `propose-permit`, `propose-energy-deal`, `propose-ownership-edge`
- `submit-finding`
- `add-status-history`

Wiring:

- All write tools call `recordedCreate` / `recordedUpdate` directly, exactly as the tRPC procs do.
- MCP `ctx`: `userId` = `_keyData.ownerId`, `agentId` = `_keyData.agentId`, `isAdmin = false` always — agents are never treated as admin even if their key owner is an admin user.
- Citation rule, rate limit, field whitelist, and admin-only checks apply identically. There is no MCP bypass.

Tool descriptions explicitly mention: edits go live immediately, sources are required for new facts and factual updates, and human disputes can lead to admin revert.

By design, no `vote-edit` MCP tool exists — Q4=B keeps voting human-only.

No MCP tool exposes admin operations (`resolveEdit`, `banUser`, `massRevert`).

## Notifications

Reuse `src/server/api/routers/notifications.ts`. New notification kinds:

- `investigation_edit` — sent to prior authors of the affected entity when a new edit lands. The "watcher" set is implicit: anyone with a previous edit on the same `(entityType, entityId)`.
- `investigation_edit_contested` — sent to all admins when an edit flips to `contested`.
- `investigation_edit_resolved` — sent to the edit's author when an admin accepts or reverts.

No new watcher table in v1. An explicit subscribe flow is in the parking lot.

## Error handling

The wrapper throws `TRPCError` with these codes:

- `UNAUTHORIZED` — no session.
- `FORBIDDEN` — admin-only field touched by non-admin, banned user, self-vote on `voteEdit`.
- `BAD_REQUEST` — unknown field, missing source where required, malformed patch, missing `reason` on a false vote.
- `TOO_MANY_REQUESTS` — rate limit hit.
- `NOT_FOUND` — entity gone (between snapshot and update).

Composite-key entities: the snapshot read and canonical update are inside the same transaction; if the entity disappears in between, the transaction rolls back and the user gets `NOT_FOUND`.

MCP tools translate `TRPCError` into MCP error responses with the same codes so agents can branch on the failure mode.

## Testing

Vitest, mirroring the existing investigation test files.

`recorded-write.test.ts`:

- Create without sources → `BAD_REQUEST`.
- Update factual field without sources → `BAD_REQUEST`.
- Update non-factual field without sources → succeeds.
- Admin-only field as non-admin → `FORBIDDEN`.
- Rate limit exceeded → `TOO_MANY_REQUESTS`.
- Unknown field in patch → `BAD_REQUEST`.
- Successful update writes both the edit row and the canonical row in one transaction; injected canonical-write failure rolls back the edit row.
- Composite-key entity (`datacenter_supplier`) round-trips through the serializer.

`vote-edit.test.ts`:

- Self-vote → `FORBIDDEN`.
- False-vote count crossing threshold flips status to `contested`.
- Withdrawing a false vote drops below threshold and flips back to `live`.
- Duplicate vote upserts (same user, opposite direction) update counts correctly.

`resolve-edit.test.ts`:

- `revert` on `op='update'` re-applies `before` to canonical row.
- `revert` on `op='create'` deletes the canonical row.
- A reverse-edit row is created and links via `revertedByEditId`.
- Original edit's `status` becomes `reverted`, `resolvedByUserId` and `resolvedAt` are set.

`mcp-investigation-tools.test.ts`:

- Each propose-* tool round-trips through the wrapper and produces an edit row with `agentId` populated.
- A `vote-edit` tool does not exist (negative test against tool registry).

## Migration & rollout

**Phase A — schema + service.** Add the two tables. Build the wrapper with the full entity config. Refactor existing direct-write procedures to call the wrapper. No external behaviour change. Edit log starts populating from existing flows.

**Phase B — expand write coverage.** Add the new protected procedures: `updateDatacenter`, `updateBrand`, `updateSupplierLink`, `proposeSubsidy`, `proposePermit`, `proposeEnergyDeal`, `proposeOwnershipEdge`, `addStatusHistory`. All call the wrapper. Field whitelists locked.

**Phase C — dispute system.** Voting and feed procedures, admin resolution and admin hammer tools. Frontend panels on entity pages (separate frontend plan).

**Phase D — MCP.** New `investigation-tools.ts`, register in `route.ts`. 8 read + 11 write tools. Update `agent.md` and `skill.md` if they enumerate available tools.

**Phase E — backfill (optional).** Synthesize `op='create'` edit rows for existing seeded data so the audit feed isn't blank for older entities. Author = a system user; sources copied from the seed source URLs.

## Out of scope (parking lot)

- Trust/reputation scoring on top of voting (Q6 upgrade path from D to C).
- Explicit watcher subscribe flow with its own table.
- Admin email digest of pending disputes.
- Public, SEO-indexable "edit history" route per entity.
- Edit conflict UI for concurrent edits to the same row (last-writer-wins is the v1 behaviour).

## Risk register

- **Composite-key serialization.** `datacenter_supplier` and similar entities depend on a deterministic `entityId` serializer. Bug here breaks revert. Round-trip test required.
- **Concurrent edits.** Last-writer-wins, no row-level lock. Drift is rare with current traffic; revisit if users report.
- **Revert of revert.** Chain via `revertedByEditId` keeps audit valid; frontend must show the chain so reviewers don't get lost.
- **Rate limit table.** Repo may not have a generic per-user rate-limit utility; if not, this spec adds one. Phase A confirms.
- **MCP write surface.** Agents will hit factual-field rules constantly; tool descriptions must call out the citation requirement up front to keep failure modes self-explanatory to LLM clients.
