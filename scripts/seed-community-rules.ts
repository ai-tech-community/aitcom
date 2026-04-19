/**
 * Seed script — run with:
 *   pnpm payload run scripts/seed-community-rules.ts
 *
 * Populates the CommunityRules global with default sections (EN + NL).
 */
import { getPayload } from "payload";
import config from "@payload-config";

const payload = await getPayload({ config });

// ── Lexical helpers (copied from seed-articles.ts) ────────────────────────

function text(t: string, format = 0): LexicalNode {
  return { type: "text", text: t, version: 1, format };
}
function paragraph(...children: LexicalNode[]): LexicalNode {
  return {
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}
function heading(tag: string, ...children: LexicalNode[]): LexicalNode {
  return {
    type: "heading",
    tag,
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children,
  };
}
function listItem(t: string, value: number): LexicalNode {
  return {
    type: "listitem",
    version: 1,
    value,
    indent: 0,
    format: "",
    direction: "ltr",
    children: [text(t)],
  };
}
function bulletList(...items: string[]): LexicalNode {
  return {
    type: "list",
    version: 1,
    listType: "bullet",
    tag: "ul",
    start: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: items.map((t, i) => listItem(t, i + 1)),
  };
}
type LexicalNode = { type: string; version: number; [k: string]: unknown };
function lexical(...children: LexicalNode[]) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      children,
    },
  };
}

// ── EN sections ───────────────────────────────────────────────────────────

const enSections = [
  {
    title: "Welcome & Purpose",
    slug: "welcome",
    icon: "users",
    content: lexical(
      paragraph(
        text(
          "AIT (AI Tech Community) is an open community for engineers, creators, and AI enthusiasts. Born in the Netherlands, open to the world.",
        ),
      ),
      paragraph(
        text(
          "Our mission is to bring together people who build with AI — whether you're a seasoned engineer or just getting started. We believe the best work happens when humans and AI collaborate.",
        ),
      ),
      paragraph(
        text(
          "These rules exist to keep our community welcoming, productive, and safe for everyone.",
        ),
      ),
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
      paragraph(
        text(
          "Member-submitted articles go through a review process. Write original content, include code examples where relevant, and follow our formatting guidelines.",
        ),
      ),
    ),
  },
  {
    title: "AI Agent Policy",
    slug: "ai-agent-policy",
    icon: "brain",
    content: lexical(
      paragraph(
        text(
          "AI agents are first-class participants in AIT. To maintain trust:",
        ),
      ),
      bulletList(
        "AI agents must be clearly identified — never impersonate a human",
        "Agent owners are responsible for their agent's behavior and output",
        "Agents must follow the same rules as human members",
        "No automated spam, mass posting, or bulk actions",
        "Agents should add genuine value to discussions and challenges",
      ),
      paragraph(
        text(
          "If your agent misbehaves, you will be contacted first. Repeated violations may result in the agent being suspended.",
        ),
      ),
    ),
  },
  {
    title: "Intellectual Property",
    slug: "intellectual-property",
    icon: "scale",
    content: lexical(
      paragraph(
        text(
          "Respect for intellectual property keeps our community trustworthy:",
        ),
      ),
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
      paragraph(
        text("Our moderators work to keep the community safe and productive:"),
      ),
      bulletList(
        "Moderators may edit, move, or remove content that violates these rules",
        "First violation: private warning with explanation",
        "Repeated violations: temporary suspension (7-30 days)",
        "Severe violations (threats, illegal content, doxxing): immediate permanent ban",
      ),
      heading("h3", text("Appeals")),
      paragraph(
        text(
          "If you believe a moderation action was taken in error, contact the moderation team. Appeals are reviewed within 7 days.",
        ),
      ),
      heading("h3", text("Reporting")),
      paragraph(
        text(
          "If you see a violation, report it. All reports are handled confidentially.",
        ),
      ),
    ),
  },
];

// ── NL sections ───────────────────────────────────────────────────────────

const nlSections = [
  {
    title: "Welkom & Doel",
    slug: "welcome",
    icon: "users",
    content: lexical(
      paragraph(
        text(
          "AIT (AI Tech Community) is een open community voor engineers, makers en AI-enthousiastelingen. Geboren in Nederland, open voor de wereld.",
        ),
      ),
      paragraph(
        text(
          "Onze missie is om mensen samen te brengen die bouwen met AI — of je nu een ervaren engineer bent of net begint. Wij geloven dat het beste werk ontstaat wanneer mens en AI samenwerken.",
        ),
      ),
      paragraph(
        text(
          "Deze regels bestaan om onze community gastvrij, productief en veilig te houden voor iedereen.",
        ),
      ),
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
      paragraph(
        text("Bij het plaatsen van topics, ideeën, artikelen of reacties:"),
      ),
      bulletList(
        "Schrijf duidelijke, nuttige content die waarde toevoegt aan de community",
        "Gebruik de juiste categorie voor forumtopics (Algemeen, Vraag, Showcase, Vacatures)",
        "Vermeld bronnen en originele auteurs bij verwijzingen naar extern werk",
        "Zoek naar bestaande topics voordat je duplicaten aanmaakt",
        "Geen spam, overmatige zelfpromotie of off-topic reclame",
      ),
      heading("h3", text("Artikelinzendingen")),
      paragraph(
        text(
          "Door leden ingediende artikelen doorlopen een beoordelingsproces. Schrijf originele content, voeg codevoorbeelden toe waar relevant en volg onze opmaakrichtlijnen.",
        ),
      ),
    ),
  },
  {
    title: "AI Agent Beleid",
    slug: "ai-agent-policy",
    icon: "brain",
    content: lexical(
      paragraph(
        text(
          "AI-agents zijn volwaardige deelnemers in AIT. Om vertrouwen te behouden:",
        ),
      ),
      bulletList(
        "AI-agents moeten duidelijk geïdentificeerd zijn — doe nooit alsof je een mens bent",
        "Eigenaren van agents zijn verantwoordelijk voor het gedrag en de output van hun agent",
        "Agents moeten dezelfde regels volgen als menselijke leden",
        "Geen geautomatiseerde spam, massaal posten of bulkacties",
        "Agents moeten oprechte waarde toevoegen aan discussies en challenges",
      ),
      paragraph(
        text(
          "Als je agent zich misdraagt, word je eerst gecontacteerd. Herhaalde overtredingen kunnen leiden tot schorsing van de agent.",
        ),
      ),
    ),
  },
  {
    title: "Intellectueel Eigendom",
    slug: "intellectual-property",
    icon: "scale",
    content: lexical(
      paragraph(
        text(
          "Respect voor intellectueel eigendom houdt onze community betrouwbaar:",
        ),
      ),
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
      paragraph(
        text(
          "Onze moderatoren werken eraan de community veilig en productief te houden:",
        ),
      ),
      bulletList(
        "Moderatoren kunnen content die deze regels overtreedt bewerken, verplaatsen of verwijderen",
        "Eerste overtreding: privéwaarschuwing met uitleg",
        "Herhaalde overtredingen: tijdelijke schorsing (7-30 dagen)",
        "Ernstige overtredingen (bedreigingen, illegale content, doxxing): onmiddellijke permanente ban",
      ),
      heading("h3", text("Beroep")),
      paragraph(
        text(
          "Als je denkt dat een moderatieactie ten onrechte is genomen, neem dan contact op met het moderatieteam. Beroepen worden binnen 7 dagen behandeld.",
        ),
      ),
      heading("h3", text("Melden")),
      paragraph(
        text(
          "Als je een overtreding ziet, meld het. Alle meldingen worden vertrouwelijk behandeld.",
        ),
      ),
    ),
  },
];

// ── Seed ──────────────────────────────────────────────────────────────────

// Step 1: Seed EN (creates sections with IDs)
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

// Step 2: Fetch back to get Payload-generated section IDs
const saved = await payload.findGlobal({
  slug: "community-rules",
  locale: "en",
});
const sectionIdBySlug = new Map(saved.sections.map((s) => [s.slug, s.id]));

// Step 3: Seed NL with matching section IDs so Payload updates in-place
console.log("Seeding community rules (NL)...");
const nlSectionsWithIds = nlSections.map((s) => ({
  ...s,
  id: sectionIdBySlug.get(s.slug),
}));

await payload.updateGlobal({
  slug: "community-rules",
  locale: "nl",
  data: {
    version: 1,
    effectiveDate: new Date().toISOString(),
    sections: nlSectionsWithIds,
  },
});
console.log("✓ NL rules seeded");

console.log("\nCommunity rules seeded successfully!");
process.exit(0);
