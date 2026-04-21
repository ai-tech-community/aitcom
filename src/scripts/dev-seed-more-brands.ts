/**
 * Dev-only: seed additional brand entries to cover the starter prompts
 * (CRM, password managers, email newsletters, AI coding assistants), then
 * re-resolve unresolved benchmark_brand_mention rows and drain matching
 * brand_alias_queue entries.
 *
 * Usage: pnpm dlx tsx --env-file=.env src/scripts/dev-seed-more-brands.ts
 */

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const NEW_BRANDS: Array<{
  slug: string;
  canonicalName: string;
  aliases: string[];
}> = [
  // CRM
  { slug: "salesforce", canonicalName: "Salesforce", aliases: ["sfdc"] },
  { slug: "hubspot", canonicalName: "HubSpot", aliases: [] },
  { slug: "pipedrive", canonicalName: "Pipedrive", aliases: [] },
  { slug: "zoho-crm", canonicalName: "Zoho CRM", aliases: ["zoho"] },
  { slug: "close", canonicalName: "Close", aliases: ["close.com", "close crm"] },
  { slug: "monday-crm", canonicalName: "monday.com", aliases: ["monday"] },
  { slug: "attio", canonicalName: "Attio", aliases: [] },
  { slug: "folk", canonicalName: "Folk", aliases: [] },
  { slug: "copper", canonicalName: "Copper", aliases: ["copper crm"] },
  { slug: "freshsales", canonicalName: "Freshsales", aliases: ["freshworks"] },

  // Password managers
  { slug: "1password", canonicalName: "1Password", aliases: ["1pw"] },
  { slug: "bitwarden", canonicalName: "Bitwarden", aliases: [] },
  { slug: "dashlane", canonicalName: "Dashlane", aliases: [] },
  { slug: "lastpass", canonicalName: "LastPass", aliases: [] },
  { slug: "keeper", canonicalName: "Keeper", aliases: ["keeper security"] },
  { slug: "nordpass", canonicalName: "NordPass", aliases: [] },
  { slug: "proton-pass", canonicalName: "Proton Pass", aliases: ["protonpass"] },

  // Email newsletter
  { slug: "mailchimp", canonicalName: "Mailchimp", aliases: [] },
  { slug: "substack", canonicalName: "Substack", aliases: [] },
  { slug: "beehiiv", canonicalName: "Beehiiv", aliases: [] },
  { slug: "convertkit", canonicalName: "Kit", aliases: ["convertkit"] },
  { slug: "ghost", canonicalName: "Ghost", aliases: ["ghost.org"] },
  { slug: "buttondown", canonicalName: "Buttondown", aliases: [] },
  { slug: "mailerlite", canonicalName: "MailerLite", aliases: [] },
  { slug: "sendgrid", canonicalName: "SendGrid", aliases: [] },
  { slug: "customerio", canonicalName: "Customer.io", aliases: ["customer io"] },

  // AI coding assistants
  { slug: "github-copilot", canonicalName: "GitHub Copilot", aliases: ["copilot"] },
  { slug: "cursor", canonicalName: "Cursor", aliases: ["cursor ai"] },
  { slug: "codeium", canonicalName: "Codeium", aliases: ["windsurf"] },
  { slug: "tabnine", canonicalName: "Tabnine", aliases: [] },
  { slug: "claude-code", canonicalName: "Claude Code", aliases: [] },
  { slug: "cline", canonicalName: "Cline", aliases: [] },
  { slug: "zed", canonicalName: "Zed", aliases: [] },
  { slug: "replit", canonicalName: "Replit", aliases: ["replit agent"] },

  // LLM APIs already exist (openai, anthropic, google-gemini) — add a few more
  { slug: "cohere", canonicalName: "Cohere", aliases: [] },
  { slug: "mistral", canonicalName: "Mistral", aliases: ["mistral ai"] },
  { slug: "groq", canonicalName: "Groq", aliases: [] },
  { slug: "together-ai", canonicalName: "Together AI", aliases: ["together", "together.ai"] },
];

async function main() {
  const [aiTools] = (await sql`
    SELECT id FROM "app"."benchmark_category" WHERE slug = 'ai-tools' LIMIT 1
  `) as Array<{ id: string }>;
  if (!aiTools) throw new Error("ai-tools category missing");

  let inserted = 0;
  for (const b of NEW_BRANDS) {
    const res = (await sql`
      INSERT INTO "app"."brand"
        ("slug", "canonical_name", "aliases", "category_ids", "verified")
      VALUES (
        ${b.slug}, ${b.canonicalName}, ${b.aliases}, ARRAY[${aiTools.id}]::uuid[], true
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;
    if (res.length > 0) inserted++;
  }
  console.log(`Inserted ${inserted} new brands.`);

  const brandRows = (await sql`
    SELECT id, slug, canonical_name, aliases FROM "app"."brand"
  `) as Array<{
    id: string;
    slug: string;
    canonical_name: string;
    aliases: string[] | null;
  }>;

  const byKey = new Map<string, string>();
  for (const b of brandRows) {
    byKey.set(b.slug.toLowerCase(), b.id);
    byKey.set(b.canonical_name.toLowerCase(), b.id);
    for (const a of b.aliases ?? []) byKey.set(a.toLowerCase(), b.id);
  }

  const unresolved = (await sql`
    SELECT id, raw_mention FROM "app"."benchmark_brand_mention"
    WHERE brand_id IS NULL
  `) as Array<{ id: string; raw_mention: string }>;

  let resolved = 0;
  for (const m of unresolved) {
    const hit = byKey.get(m.raw_mention.trim().toLowerCase());
    if (hit) {
      await sql`
        UPDATE "app"."benchmark_brand_mention"
        SET brand_id = ${hit}
        WHERE id = ${m.id}
      `;
      resolved++;
    }
  }
  console.log(`Re-resolved ${resolved}/${unresolved.length} previously-unresolved mentions.`);

  const queue = (await sql`
    SELECT id, raw_mention FROM "app"."brand_alias_queue" WHERE status = 'pending'
  `) as Array<{ id: string; raw_mention: string }>;
  let merged = 0;
  for (const q of queue) {
    if (byKey.has(q.raw_mention.trim().toLowerCase())) {
      await sql`
        UPDATE "app"."brand_alias_queue"
        SET status = 'merged', reviewed_at = now()
        WHERE id = ${q.id}
      `;
      merged++;
    }
  }
  console.log(`Marked ${merged}/${queue.length} alias-queue entries as merged.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
