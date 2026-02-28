# Community Rules Enhancement Design

## Problem

The community rules modal is empty because no content has been entered. The existing `CommunityRules` Payload global has a single `richText` field, which is insufficient for structured, versioned, localized community rules with user acknowledgment tracking.

## Goals

1. **Structured sections** — Break rules into named, individually editable sections with a table of contents
2. **Localization** — Support EN/NL using Payload's built-in localization
3. **Version-aware acknowledgment** — Track which users accepted which version; gate community actions behind acceptance
4. **Seed content** — Ship sensible default rules for an open AI/tech community

## Architecture

### 1. Payload Global: `CommunityRules` (Enhanced)

Replace the single `richText` field with structured fields:

```
CommunityRules global (slug: "community-rules"):
├── version (number, required, default: 1)
│   Auto-incremented by admin when rules change meaningfully
├── effectiveDate (date, required)
│   When this version takes effect
├── sections (array, required):
│   ├── title (text, required, localized)
│   │   e.g. "Code of Conduct"
│   ├── slug (text, required)
│   │   Auto-generated from title, used for anchor links/TOC
│   ├── icon (select, optional)
│   │   Visual marker: shield, users, flag, scale, brain, gavel
│   └── content (richText, required, localized)
│       Section body with full Lexical formatting
└── updatedAt (auto)
```

**Admin experience:** Each section appears as a collapsible row in the Payload admin. Admins click the locale toggle to switch between EN/NL for each section's title and content.

### 2. Payload Collection: `RulesAcceptance`

New collection to track user acknowledgment:

```
RulesAcceptance collection (slug: "rules-acceptance"):
├── userId (text, required, indexed)
├── rulesVersion (number, required)
├── acceptedAt (date, required)
└── unique compound index on (userId, rulesVersion)
```

**Access control:**
- Create: authenticated users only (for their own userId)
- Read: admins can view all; users can read their own
- Update/Delete: admin only

### 3. tRPC Endpoints (Enhanced)

**`getRules` (public)** — Returns rules with sections and current version. If user is authenticated, also returns their latest acceptance info.

```typescript
getRules: publicProcedure.query(async ({ ctx }) => {
  const rules = await payload.findGlobal({ slug: "community-rules", locale });
  const acceptance = ctx.session?.user
    ? await payload.find({ collection: "rules-acceptance", where: { userId, rulesVersion } })
    : null;
  return { ...rules, hasAccepted: !!acceptance, acceptedVersion: ... };
});
```

**`acceptRules` (protected)** — Records user acceptance of the current version.

```typescript
acceptRules: protectedProcedure.mutation(async ({ ctx }) => {
  const rules = await payload.findGlobal({ slug: "community-rules" });
  await payload.create({
    collection: "rules-acceptance",
    data: { userId, rulesVersion: rules.version, acceptedAt: new Date() },
  });
});
```

**Gated mutations** — `createThread`, `submitIdea`, `toggleVote`, `addReply` check acceptance:

```typescript
// Shared helper
async function requireRulesAcceptance(userId: string) {
  const rules = await payload.findGlobal({ slug: "community-rules" });
  const { docs } = await payload.find({
    collection: "rules-acceptance",
    where: { and: [
      { userId: { equals: userId } },
      { rulesVersion: { equals: rules.version } },
    ]},
    limit: 1,
  });
  if (docs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}
```

### 4. Frontend: Enhanced Rules Modal

```
RulesModal
├── Table of Contents (sticky top, clickable section links)
├── Section list (scrollable)
│   └── For each section:
│       ├── Icon + Title (h2, with anchor ID)
│       └── LexicalRenderer content
├── Acceptance footer (sticky bottom, authenticated users only)
│   ├── If not accepted: "I have read and accept these community rules" button
│   ├── If accepted: "Accepted on [date]" note
│   └── If not logged in: hidden
└── Version indicator (small text showing "v{version}")
```

**Error handling for gated mutations:** When a protected mutation returns `RULES_NOT_ACCEPTED`, the frontend shows a toast/dialog prompting the user to open the rules modal and accept.

### 5. Seed Content

Six sections for an open AI/tech community:

1. **Welcome & Purpose**
   - What AIT is, its mission, who it's for
   - Open to all, born in the Netherlands

2. **Code of Conduct**
   - Be respectful and constructive
   - No harassment, discrimination, or personal attacks
   - Assume good intent, value diverse perspectives
   - Keep discussions professional

3. **Content Guidelines**
   - Write clear, helpful posts
   - Use appropriate categories for threads
   - No spam, self-promotion without value, or duplicate posts
   - Credit sources and original authors

4. **AI Agent Policy**
   - AI agents must be clearly identified as such
   - Agent owners are responsible for their agent's behavior
   - Agents must follow the same rules as human members
   - No automated spam or mass actions

5. **Intellectual Property**
   - Content you post remains yours
   - Challenge submissions follow the challenge-specific license
   - Don't share proprietary code or confidential information
   - Respect open-source licenses

6. **Moderation & Enforcement**
   - Moderators may edit, move, or remove content
   - Violations result in warnings, then temporary/permanent suspension
   - Appeal process: contact the moderation team
   - Severe violations (threats, illegal content) result in immediate action

### 6. i18n Updates

Add new translation keys:

```json
"community.rules.accept": "I have read and accept these community rules",
"community.rules.accepted": "You accepted the rules on {date}",
"community.rules.version": "Version {version}",
"community.rules.mustAccept": "Please review and accept the community rules before participating",
"community.rules.toc": "Table of Contents"
```

## Files to Create/Modify

### Create:
- `src/collections/RulesAcceptance.ts` — New Payload collection
- `src/scripts/seed-community-rules.ts` — Seed script for default content

### Modify:
- `src/collections/CommunityRules.ts` — Add structured fields
- `src/payload.config.ts` — Register RulesAcceptance collection
- `src/payload-types.ts` — Regenerate types
- `src/server/api/routers/community.ts` — Enhanced getRules, new acceptRules, gated mutations
- `src/components/community/modals/rules-modal.tsx` — TOC, sections, accept button
- `messages/en.json` — New translation keys
- `messages/nl.json` — Dutch translations

## Non-Goals

- Per-section acknowledgment (overkill for now)
- Rules change notifications (can be added later)
- Rules diff/changelog between versions
- PDF export of rules
