# Community Rules Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the community rules system with structured sections, localization, version-aware user acknowledgment, and seed content.

**Architecture:** The existing `CommunityRules` Payload global gets structured fields (version, effectiveDate, localized sections array). A new `RulesAcceptance` Payload collection tracks which users accepted which version. Community mutations are gated behind acceptance. The frontend modal gets a TOC, section rendering, and an accept button.

**Tech Stack:** Payload CMS 3.x (globals + collections), tRPC, Next.js 15 App Router, React 19, Lexical rich text, next-intl, Tailwind CSS

---

### Task 1: Enhance `CommunityRules` Payload Global

**Files:**
- Modify: `src/collections/CommunityRules.ts`

**Step 1: Replace the single richText field with structured fields**

```typescript
import type { GlobalConfig } from "payload";

export const CommunityRules: GlobalConfig = {
  slug: "community-rules",
  label: "Community Rules",
  admin: {
    description:
      "The community code of conduct displayed on the Community board.",
  },
  fields: [
    {
      name: "version",
      type: "number",
      required: true,
      defaultValue: 1,
      admin: {
        description: "Increment this when rules change to require re-acceptance.",
      },
    },
    {
      name: "effectiveDate",
      type: "date",
      required: true,
      admin: {
        description: "When this version of the rules takes effect.",
      },
    },
    {
      name: "sections",
      type: "array",
      required: true,
      minRows: 1,
      fields: [
        {
          name: "title",
          type: "text",
          required: true,
          localized: true,
        },
        {
          name: "slug",
          type: "text",
          required: true,
          admin: {
            description: "URL-friendly identifier for anchor links (e.g. 'code-of-conduct').",
          },
        },
        {
          name: "icon",
          type: "select",
          options: [
            { label: "Shield", value: "shield" },
            { label: "Users", value: "users" },
            { label: "Flag", value: "flag" },
            { label: "Scale", value: "scale" },
            { label: "Brain", value: "brain" },
            { label: "Gavel", value: "gavel" },
          ],
        },
        {
          name: "content",
          type: "richText",
          required: true,
          localized: true,
        },
      ],
    },
  ],
};
```

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors related to CommunityRules

**Step 3: Commit**

```bash
git add src/collections/CommunityRules.ts
git commit -m "feat(rules): enhance CommunityRules global with structured sections"
```

---

### Task 2: Create `RulesAcceptance` Payload Collection

**Files:**
- Create: `src/collections/RulesAcceptance.ts`
- Modify: `src/payload.config.ts`

**Step 1: Create the collection file**

```typescript
// src/collections/RulesAcceptance.ts
import type { CollectionConfig } from "payload";

export const RulesAcceptance: CollectionConfig = {
  slug: "rules-acceptance",
  admin: {
    useAsTitle: "userId",
    defaultColumns: ["userId", "rulesVersion", "acceptedAt"],
    description: "Tracks which users have accepted which version of the community rules.",
  },
  fields: [
    {
      name: "userId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID (UUID)." },
    },
    {
      name: "rulesVersion",
      type: "number",
      required: true,
    },
    {
      name: "acceptedAt",
      type: "date",
      required: true,
    },
  ],
  timestamps: true,
};
```

**Step 2: Register the collection in Payload config**

In `src/payload.config.ts`, add the import and add to collections array:

```typescript
import { RulesAcceptance } from "./collections/RulesAcceptance";
```

Add `RulesAcceptance` to the `collections` array (after `Jobs`).

**Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/collections/RulesAcceptance.ts src/payload.config.ts
git commit -m "feat(rules): add RulesAcceptance Payload collection"
```

---

### Task 3: Generate Payload Types and Create Migration

**Files:**
- Modify: `src/payload-types.ts` (auto-generated)
- Create: `src/migrations/YYYYMMDD_HHMMSS_community_rules_sections.ts` (auto-generated)

**Step 1: Generate updated TypeScript types**

Run: `pnpm payload generate:types`
Expected: `src/payload-types.ts` is updated with new `CommunityRule` type (sections array, version, effectiveDate) and new `RulesAcceptance` type.

**Step 2: Create database migration**

Run: `pnpm payload migrate:create community_rules_sections`
Expected: A new migration file is created in `src/migrations/`

**Step 3: Run the migration**

Run: `pnpm payload migrate`
Expected: Migration runs successfully, database tables updated

**Step 4: Verify types are correct**

Run: `pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/payload-types.ts src/migrations/
git commit -m "chore: generate types and migration for community rules enhancement"
```

---

### Task 4: Update tRPC Community Router — Enhanced `getRules` and new `acceptRules`

**Files:**
- Modify: `src/server/api/routers/community.ts`

**Step 1: Update `getRules` to return version and acceptance status**

Replace the existing `getRules` procedure:

```typescript
getRules: publicProcedure.query(async ({ ctx }) => {
  const payload = await getPayloadClient();
  const rules = await payload.findGlobal({ slug: "community-rules" });

  const userId = ctx.session?.user?.id;
  let hasAccepted = false;
  let acceptedAt: string | null = null;

  if (userId && rules.version) {
    const { docs } = await payload.find({
      collection: "rules-acceptance",
      where: {
        and: [
          { userId: { equals: userId } },
          { rulesVersion: { equals: rules.version } },
        ],
      },
      limit: 1,
      depth: 0,
    });
    if (docs.length > 0) {
      hasAccepted = true;
      acceptedAt = docs[0]!.acceptedAt;
    }
  }

  return { ...rules, hasAccepted, acceptedAt };
}),
```

**Step 2: Add `acceptRules` mutation**

Add after `getRules`:

```typescript
acceptRules: protectedProcedure.mutation(async ({ ctx }) => {
  const payload = await getPayloadClient();
  const rules = await payload.findGlobal({ slug: "community-rules" });

  if (!rules.version) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Community rules have not been published yet.",
    });
  }

  // Check if already accepted this version
  const { docs: existing } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: ctx.session.user.id } },
        { rulesVersion: { equals: rules.version } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  if (existing.length > 0) {
    return { alreadyAccepted: true };
  }

  await payload.create({
    collection: "rules-acceptance",
    data: {
      userId: ctx.session.user.id,
      rulesVersion: rules.version,
      acceptedAt: new Date().toISOString(),
    },
  });

  return { alreadyAccepted: false };
}),
```

**Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/server/api/routers/community.ts
git commit -m "feat(rules): add getRules acceptance check and acceptRules mutation"
```

---

### Task 5: Gate Community Mutations Behind Rules Acceptance

**Files:**
- Modify: `src/server/api/routers/community.ts`

**Step 1: Add a shared helper function at the top of the router file**

Add this helper before `createTRPCRouter`:

```typescript
async function requireRulesAcceptance(userId: string) {
  const payload = await getPayloadClient();
  const rules = await payload.findGlobal({ slug: "community-rules" });

  // If no rules version is set yet, skip the check
  if (!rules.version) return;

  const { docs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  if (docs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}
```

**Step 2: Add the check to each protected mutation**

Add `await requireRulesAcceptance(ctx.session.user.id);` as the first line in these mutations:
- `submitIdea` (line ~69)
- `toggleVote` (line ~99)
- `createThread` (line ~196)
- `addReply` (line ~244)

Example for `submitIdea`:
```typescript
submitIdea: protectedProcedure
  .input(...)
  .mutation(async ({ ctx, input }) => {
    await requireRulesAcceptance(ctx.session.user.id);
    // ... rest of existing code
  }),
```

**Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/server/api/routers/community.ts
git commit -m "feat(rules): gate community mutations behind rules acceptance"
```

---

### Task 6: Add i18n Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add English keys**

Add these keys inside `"community" > "rules"`:

```json
"accept": "I have read and accept these community rules",
"accepted": "You accepted the rules on {date}",
"versionLabel": "Version {version}",
"mustAccept": "Please review and accept the community rules before participating.",
"toc": "Table of Contents",
"loading": "Loading rules...",
"empty": "Community rules are being written. Check back soon."
```

**Step 2: Add Dutch keys**

Add these keys inside `"community" > "rules"` in `nl.json`:

```json
"accept": "Ik heb de communityregels gelezen en ga akkoord",
"accepted": "Je hebt de regels geaccepteerd op {date}",
"versionLabel": "Versie {version}",
"mustAccept": "Lees en accepteer de communityregels voordat je deelneemt.",
"toc": "Inhoudsopgave",
"loading": "Regels laden...",
"empty": "De communityregels worden geschreven. Kom snel terug."
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(rules): add i18n keys for rules acceptance UI"
```

---

### Task 7: Update Rules Modal — Sections, TOC, and Accept Button

**Files:**
- Modify: `src/components/community/modals/rules-modal.tsx`

**Step 1: Rewrite the modal with structured sections and acceptance**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { LexicalRenderer } from "@/lib/lexical";
import { BuildingModal } from "../building-modal";
import {
  Shield,
  Users,
  Flag,
  Scale,
  Brain,
  Gavel,
  Check,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  shield: Shield,
  users: Users,
  flag: Flag,
  scale: Scale,
  brain: Brain,
  gavel: Gavel,
};

type RulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  windowIndex?: number;
};

export function RulesModal({
  isOpen,
  onClose,
  title,
  subtitle,
  windowIndex,
}: RulesModalProps) {
  const t = useTranslations("community.rules");
  const { data, isLoading } = api.community.getRules.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const utils = api.useUtils();
  const acceptMutation = api.community.acceptRules.useMutation({
    onSuccess: () => {
      void utils.community.getRules.invalidate();
    },
  });

  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = data?.sections ?? [];
  const hasAccepted = data?.hasAccepted ?? false;

  return (
    <BuildingModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      windowIndex={windowIndex}
    >
      {isLoading && (
        <div className="space-y-3 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-zinc-100" />
          ))}
        </div>
      )}

      {data && sections.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Table of Contents */}
          <nav className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
            <p className="mb-2 font-mono text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
              {t("toc")}
            </p>
            <ul className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon ? iconMap[section.icon] : null;
                return (
                  <li key={section.slug}>
                    <a
                      href={`#rule-${section.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveSection(section.slug);
                        document
                          .getElementById(`rule-${section.slug}`)
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-zinc-100 ${
                        activeSection === section.slug
                          ? "font-medium text-orange-600"
                          : "text-zinc-600"
                      }`}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      {section.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sections */}
          <div className="space-y-6">
            {sections.map((section) => {
              const Icon = section.icon ? iconMap[section.icon] : null;
              return (
                <section key={section.slug} id={`rule-${section.slug}`}>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
                    {Icon && (
                      <Icon className="h-4.5 w-4.5 text-orange-500" />
                    )}
                    {section.title}
                  </h2>
                  <div className="prose prose-sm mt-2 max-w-none prose-headings:text-zinc-900 prose-p:text-zinc-600 prose-a:text-orange-600">
                    <LexicalRenderer content={section.content} />
                  </div>
                </section>
              );
            })}
          </div>

          {/* Version & Acceptance Footer */}
          <div className="mt-4 border-t border-zinc-100 pt-4">
            {data.version && (
              <p className="mb-2 font-mono text-[10px] text-zinc-400">
                {t("versionLabel", { version: data.version })}
              </p>
            )}

            {hasAccepted && data.acceptedAt ? (
              <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                <Check className="h-4 w-4" />
                {t("accepted", {
                  date: new Date(data.acceptedAt).toLocaleDateString(),
                })}
              </div>
            ) : (
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {acceptMutation.isPending ? "..." : t("accept")}
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && (!data || sections.length === 0) && (
        <p className="py-4 font-mono text-xs text-zinc-400">
          {t("empty")}
        </p>
      )}
    </BuildingModal>
  );
}
```

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors (the types from Task 3 should match)

**Step 3: Commit**

```bash
git add src/components/community/modals/rules-modal.tsx
git commit -m "feat(rules): update modal with TOC, sections, and accept button"
```

---

### Task 8: Handle Rules Acceptance Errors in Community Modals

**Files:**
- Modify: `src/components/community/modals/ideas-modal.tsx`
- Modify: `src/components/community/modals/threads-modal.tsx`

**Step 1: Find the mutation error handlers in ideas-modal.tsx and threads-modal.tsx**

In each file, look for the `useMutation` calls for `submitIdea`, `toggleVote`, `createThread`, and `addReply`. Add error handling that detects `RULES_NOT_ACCEPTED`:

For each mutation's `onError` handler, add:

```typescript
onError: (error) => {
  if (error.message === "RULES_NOT_ACCEPTED") {
    // Show a toast or alert directing user to accept rules
    // The exact implementation depends on the existing toast/notification system
    alert(t("mustAccept")); // Replace with proper toast if available
    return;
  }
  // existing error handling...
},
```

The `t("mustAccept")` key was added in Task 6. Use `useTranslations("community.rules")` to access it.

**Note:** Check if the project has a toast/notification system (e.g. sonner, react-hot-toast) and use that instead of `alert`. If not, a simple inline error message is fine.

**Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/community/modals/ideas-modal.tsx src/components/community/modals/threads-modal.tsx
git commit -m "feat(rules): handle RULES_NOT_ACCEPTED error in community modals"
```

---

### Task 9: Create Seed Script for Default Community Rules

**Files:**
- Create: `scripts/seed-community-rules.ts`

**Step 1: Create the seed script**

Follow the exact pattern from `scripts/seed-articles.ts`. Use the same Lexical helpers.

```typescript
/**
 * Seed script — run with:
 *   pnpm payload run scripts/seed-community-rules.ts
 *
 * Populates the CommunityRules global with default sections (EN + NL).
 */
import { getPayload } from "payload";
import config from "@payload-config";

const payload = await getPayload({ config });

// ── Lexical helpers ────────────────────────────────────────────────────────

type LexicalNode = { type: string; version: number; [k: string]: unknown };

function text(t: string, format = 0): LexicalNode {
  return { type: "text", text: t, version: 1, format };
}
function paragraph(...children: LexicalNode[]): LexicalNode {
  return { type: "paragraph", version: 1, format: "", indent: 0, direction: "ltr", children };
}
function heading(tag: string, ...children: LexicalNode[]): LexicalNode {
  return { type: "heading", tag, version: 1, format: "", indent: 0, direction: "ltr", children };
}
function bulletList(...items: string[]): LexicalNode {
  return {
    type: "list", version: 1, listType: "bullet", tag: "ul", start: 1,
    format: "", indent: 0, direction: "ltr",
    children: items.map((t, i) => ({
      type: "listitem", version: 1, value: i + 1, indent: 0,
      format: "", direction: "ltr", children: [text(t)],
    })),
  };
}
function lexical(...children: LexicalNode[]) {
  return {
    root: {
      type: "root", version: 1, direction: "ltr" as const,
      format: "" as const, indent: 0, children,
    },
  };
}

// ── EN sections ────────────────────────────────────────────────────────────

const enSections = [
  {
    title: "Welcome & Purpose",
    slug: "welcome",
    icon: "users",
    content: lexical(
      paragraph(text("AIT (AI Tech Community) is an open community for engineers, creators, and AI enthusiasts. Born in the Netherlands, open to the world.")),
      paragraph(text("Our mission is to bring together people who build with AI — whether you're a seasoned engineer or just getting started. We believe the best work happens when humans and AI collaborate.")),
      paragraph(text("These rules exist to keep our community welcoming, productive, and safe for everyone.")),
    ),
  },
  {
    title: "Code of Conduct",
    slug: "code-of-conduct",
    icon: "shield",
    content: lexical(
      paragraph(text("Every member of AIT is expected to:")),
      bulletList(
        "Be respectful and constructive in all interactions",
        "Welcome newcomers and help them get started",
        "Assume good intent — ask before judging",
        "Value diverse perspectives and experiences",
        "Keep discussions professional and on-topic",
      ),
      heading("h3", text("Not Tolerated")),
      bulletList(
        "Harassment, discrimination, or personal attacks of any kind",
        "Sharing others' private information without consent",
        "Trolling, inflammatory language, or deliberate provocation",
        "Any form of hate speech or threats",
      ),
    ),
  },
  {
    title: "Content Guidelines",
    slug: "content-guidelines",
    icon: "flag",
    content: lexical(
      paragraph(text("When posting threads, ideas, articles, or replies:")),
      bulletList(
        "Write clear, helpful content that adds value to the community",
        "Use the appropriate category for forum threads (General, Question, Showcase, Job)",
        "Credit sources and original authors when referencing external work",
        "Search for existing threads before creating duplicates",
        "No spam, excessive self-promotion, or off-topic advertising",
      ),
      heading("h3", text("Article Submissions")),
      paragraph(text("Member-submitted articles go through a review process. Write original content, include code examples where relevant, and follow our formatting guidelines.")),
    ),
  },
  {
    title: "AI Agent Policy",
    slug: "ai-agent-policy",
    icon: "brain",
    content: lexical(
      paragraph(text("AI agents are first-class participants in AIT. To maintain trust:")),
      bulletList(
        "AI agents must be clearly identified — never impersonate a human",
        "Agent owners are responsible for their agent's behavior and output",
        "Agents must follow the same rules as human members",
        "No automated spam, mass posting, or bulk actions",
        "Agents should add genuine value to discussions and challenges",
      ),
      paragraph(text("If your agent misbehaves, you will be contacted first. Repeated violations may result in the agent being suspended.")),
    ),
  },
  {
    title: "Intellectual Property",
    slug: "intellectual-property",
    icon: "scale",
    content: lexical(
      paragraph(text("Respect for intellectual property keeps our community trustworthy:")),
      bulletList(
        "Content you post (threads, ideas, articles) remains yours",
        "Challenge submissions follow the license specified in each challenge",
        "Do not share proprietary code, trade secrets, or confidential information from your employer",
        "Respect open-source licenses — attribute correctly and follow license terms",
        "By posting, you grant AIT a non-exclusive license to display your content on the platform",
      ),
    ),
  },
  {
    title: "Moderation & Enforcement",
    slug: "moderation",
    icon: "gavel",
    content: lexical(
      paragraph(text("Our moderators work to keep the community safe and productive:")),
      bulletList(
        "Moderators may edit, move, or remove content that violates these rules",
        "First violation: private warning with explanation",
        "Repeated violations: temporary suspension (7-30 days)",
        "Severe violations (threats, illegal content, doxxing): immediate permanent ban",
      ),
      heading("h3", text("Appeals")),
      paragraph(text("If you believe a moderation action was taken in error, contact the moderation team. Appeals are reviewed within 7 days.")),
      heading("h3", text("Reporting")),
      paragraph(text("If you see a violation, report it. All reports are handled confidentially.")),
    ),
  },
];

// ── NL sections ────────────────────────────────────────────────────────────

const nlSections = [
  {
    title: "Welkom & Doel",
    slug: "welcome",
    icon: "users",
    content: lexical(
      paragraph(text("AIT (AI Tech Community) is een open community voor engineers, makers en AI-enthousiastelingen. Geboren in Nederland, open voor de wereld.")),
      paragraph(text("Onze missie is om mensen samen te brengen die bouwen met AI — of je nu een ervaren engineer bent of net begint. Wij geloven dat het beste werk ontstaat wanneer mens en AI samenwerken.")),
      paragraph(text("Deze regels bestaan om onze community gastvrij, productief en veilig te houden voor iedereen.")),
    ),
  },
  {
    title: "Gedragscode",
    slug: "code-of-conduct",
    icon: "shield",
    content: lexical(
      paragraph(text("Elk lid van AIT wordt verwacht:")),
      bulletList(
        "Respectvol en constructief te zijn in alle interacties",
        "Nieuwkomers te verwelkomen en te helpen op weg",
        "Goede bedoelingen te veronderstellen — vraag voordat je oordeelt",
        "Diverse perspectieven en ervaringen te waarderen",
        "Discussies professioneel en on-topic te houden",
      ),
      heading("h3", text("Niet getolereerd")),
      bulletList(
        "Intimidatie, discriminatie of persoonlijke aanvallen van welke aard dan ook",
        "Het delen van andermans privé-informatie zonder toestemming",
        "Trollen, opruiend taalgebruik of bewuste provocatie",
        "Elke vorm van haatzaaien of bedreigingen",
      ),
    ),
  },
  {
    title: "Inhoudsrichtlijnen",
    slug: "content-guidelines",
    icon: "flag",
    content: lexical(
      paragraph(text("Bij het plaatsen van topics, ideeën, artikelen of reacties:")),
      bulletList(
        "Schrijf duidelijke, nuttige content die waarde toevoegt aan de community",
        "Gebruik de juiste categorie voor forumtopics (Algemeen, Vraag, Showcase, Vacatures)",
        "Vermeld bronnen en originele auteurs bij verwijzingen naar extern werk",
        "Zoek naar bestaande topics voordat je duplicaten aanmaakt",
        "Geen spam, overmatige zelfpromotie of off-topic reclame",
      ),
      heading("h3", text("Artikelinzendingen")),
      paragraph(text("Door leden ingediende artikelen doorlopen een beoordelingsproces. Schrijf originele content, voeg codevoorbeelden toe waar relevant en volg onze opmaakrichtlijnen.")),
    ),
  },
  {
    title: "AI Agent Beleid",
    slug: "ai-agent-policy",
    icon: "brain",
    content: lexical(
      paragraph(text("AI-agents zijn volwaardige deelnemers in AIT. Om vertrouwen te behouden:")),
      bulletList(
        "AI-agents moeten duidelijk geïdentificeerd zijn — doe nooit alsof je een mens bent",
        "Eigenaren van agents zijn verantwoordelijk voor het gedrag en de output van hun agent",
        "Agents moeten dezelfde regels volgen als menselijke leden",
        "Geen geautomatiseerde spam, massaal posten of bulkacties",
        "Agents moeten oprechte waarde toevoegen aan discussies en challenges",
      ),
      paragraph(text("Als je agent zich misdraagt, word je eerst gecontacteerd. Herhaalde overtredingen kunnen leiden tot schorsing van de agent.")),
    ),
  },
  {
    title: "Intellectueel Eigendom",
    slug: "intellectual-property",
    icon: "scale",
    content: lexical(
      paragraph(text("Respect voor intellectueel eigendom houdt onze community betrouwbaar:")),
      bulletList(
        "Content die je plaatst (topics, ideeën, artikelen) blijft van jou",
        "Challenge-inzendingen volgen de licentie die in elke challenge is gespecificeerd",
        "Deel geen bedrijfseigen code, handelsgeheimen of vertrouwelijke informatie van je werkgever",
        "Respecteer open-source licenties — verwijs correct en volg licentievoorwaarden",
        "Door te posten verleen je AIT een niet-exclusieve licentie om je content op het platform te tonen",
      ),
    ),
  },
  {
    title: "Moderatie & Handhaving",
    slug: "moderation",
    icon: "gavel",
    content: lexical(
      paragraph(text("Onze moderatoren werken eraan de community veilig en productief te houden:")),
      bulletList(
        "Moderatoren kunnen content die deze regels overtreedt bewerken, verplaatsen of verwijderen",
        "Eerste overtreding: privéwaarschuwing met uitleg",
        "Herhaalde overtredingen: tijdelijke schorsing (7-30 dagen)",
        "Ernstige overtredingen (bedreigingen, illegale content, doxxing): onmiddellijke permanente ban",
      ),
      heading("h3", text("Beroep")),
      paragraph(text("Als je denkt dat een moderatieactie ten onrechte is genomen, neem dan contact op met het moderatieteam. Beroepen worden binnen 7 dagen behandeld.")),
      heading("h3", text("Melden")),
      paragraph(text("Als je een overtreding ziet, meld het. Alle meldingen worden vertrouwelijk behandeld.")),
    ),
  },
];

// ── Seed ───────────────────────────────────────────────────────────────────

console.log("Seeding community rules (EN)...");

await payload.updateGlobal({
  slug: "community-rules",
  locale: "en",
  data: {
    version: 1,
    effectiveDate: new Date().toISOString(),
    sections: enSections,
  },
});

console.log("✓ EN rules seeded");

console.log("Seeding community rules (NL)...");

// Update NL locale — only localized fields are affected
for (let i = 0; i < nlSections.length; i++) {
  const nlSection = nlSections[i]!;
  // We need to update the global with NL locale to set localized fields
  // The sections array is the same; we just override localized fields
}

// Payload handles localized fields per-locale on the global update
await payload.updateGlobal({
  slug: "community-rules",
  locale: "nl",
  data: {
    version: 1,
    effectiveDate: new Date().toISOString(),
    sections: nlSections,
  },
});

console.log("✓ NL rules seeded");
console.log("\nCommunity rules seeded successfully!");
process.exit(0);
```

**Step 2: Run the seed script**

Run: `pnpm payload run scripts/seed-community-rules.ts`
Expected: Output shows both EN and NL rules seeded successfully

**Step 3: Verify by opening the admin panel**

Visit `/admin` → Globals → Community Rules. Verify:
- Version is 1
- 6 sections are listed
- Switching locale toggle between EN/NL shows different content

**Step 4: Commit**

```bash
git add scripts/seed-community-rules.ts
git commit -m "feat(rules): add seed script with default community rules (EN + NL)"
```

---

### Task 10: Visual Verification and Smoke Test

**Files:** None (testing only)

**Step 1: Start the dev server**

Run: `pnpm dev`

**Step 2: Verify the rules modal**

1. Navigate to `/en/community`
2. Click "The Constitution" hotspot
3. Verify:
   - Table of contents shows 6 sections with icons
   - Each section renders with heading and rich text content
   - Scrolling works within the modal
   - Version indicator shows "Version 1"

**Step 3: Test acceptance flow**

1. Sign in with a test account
2. Open the rules modal
3. Scroll to the bottom — "Accept" button should be visible
4. Click accept — button should change to green "Accepted on [date]" message
5. Close and reopen — acceptance message should persist

**Step 4: Test gated mutations**

1. Create a new test account (don't accept rules)
2. Try to create a forum thread — should get `RULES_NOT_ACCEPTED` error
3. Accept rules, try again — should succeed

**Step 5: Test NL locale**

1. Navigate to `/nl/community`
2. Open rules modal — Dutch content should display

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(rules): complete community rules enhancement with sections, acceptance, and i18n"
```
