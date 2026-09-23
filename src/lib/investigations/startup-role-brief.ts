import { presentText, type StartupLocale } from "./startups";
import type { StartupRolePublic } from "./startup-roles";

export const STARTUP_BRIEF_ITEM_MAX = 240;
export const STARTUP_BRIEF_LIST_CAP = 12;

export type StartupRoleBrief = {
  title: string;
  company: string;
  location: string | null;
  workType: string | null;
  sourceUrl: string;
  seniority: string | null;
  languages: string[];
  mustHaves: string[];
  niceToHaves: string[];
};

const MUST_HEADING =
  /^(requirements?|must[- ]haves?|minimum qualifications?|what (?:you.?ll|we.?re) (?:need|looking for)|you (?:have|are)|qualifications?)\b/i;

const NICE_HEADING =
  /^(nice[- ]to[- ]haves?|bonus(?: points)?|preferred(?: qualifications?)?|plus|it.?s a plus)\b/i;

const OTHER_HEADING =
  /^(about\b|the role|key responsibilities|responsibilities|what you.?ll do|benefits|compensation|perks\b|equal opportunity|how to apply|why\b|application\b)/i;

const BULLET = /^(?:[-*•]|\d+[.)])\s+/;

const SENIORITY =
  /\b(intern(?:ship)?|junior|mid-level|senior|staff|principal|director|lead)\b/i;

const LANGUAGE =
  /\b(English|Dutch|Nederlands|German|Deutsch|French|Fran[cç]ais|Spanish|Espa[nñ]ol)\b/gi;

function clipItem(value: string): string | null {
  const text = presentText(value);
  if (!text) return null;
  return text.length > STARTUP_BRIEF_ITEM_MAX
    ? text.slice(0, STARTUP_BRIEF_ITEM_MAX)
    : text;
}

function pushUnique(list: string[], value: string | null): void {
  if (!value) return;
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) return;
  if (list.length >= STARTUP_BRIEF_LIST_CAP) return;
  list.push(value);
}

function stripBullet(line: string): string {
  return line.replace(BULLET, "").trim();
}

function isHeading(line: string): boolean {
  const trimmed = line.replace(/:+\s*$/, "").trim();
  return (
    MUST_HEADING.test(trimmed) ||
    NICE_HEADING.test(trimmed) ||
    OTHER_HEADING.test(trimmed)
  );
}

function headingKind(line: string): "must" | "nice" | "other" | null {
  const trimmed = line.replace(/:+\s*$/, "").trim();
  if (MUST_HEADING.test(trimmed)) return "must";
  if (NICE_HEADING.test(trimmed)) return "nice";
  if (OTHER_HEADING.test(trimmed)) return "other";
  return null;
}

function extractLists(description: string): {
  mustHaves: string[];
  niceToHaves: string[];
} {
  const mustHaves: string[] = [];
  const niceToHaves: string[] = [];
  let mode: "must" | "nice" | null = null;
  for (const raw of description.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const kind = headingKind(line);
    if (kind === "must") {
      mode = "must";
      continue;
    }
    if (kind === "nice") {
      mode = "nice";
      continue;
    }
    if (kind === "other") {
      mode = null;
      continue;
    }
    if (isHeading(line)) {
      mode = null;
      continue;
    }
    if (!BULLET.test(line)) continue;
    const item = clipItem(stripBullet(line));
    if (!item) continue;
    if (mode === "must") pushUnique(mustHaves, item);
    else if (mode === "nice") pushUnique(niceToHaves, item);
  }
  return { mustHaves, niceToHaves };
}

function seniorityFromTitle(title: string): string | null {
  const match = SENIORITY.exec(title);
  return match?.[1] ? match[1].toLowerCase() : null;
}

function languagesFromText(text: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(LANGUAGE.source, LANGUAGE.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const token = match[1];
    if (!token) continue;
    pushUnique(found, token);
  }
  return found;
}

export function extractStartupRoleBrief(
  role: Pick<
    StartupRolePublic,
    | "title"
    | "startupName"
    | "location"
    | "workType"
    | "sourceUrl"
    | "descriptionText"
  >,
): StartupRoleBrief {
  const description = presentText(role.descriptionText) ?? "";
  const lists = extractLists(description);
  return {
    title: role.title,
    company: role.startupName,
    location: presentText(role.location),
    workType: presentText(role.workType),
    sourceUrl: role.sourceUrl,
    seniority: seniorityFromTitle(role.title),
    languages: languagesFromText(`${role.title}\n${description}`),
    mustHaves: lists.mustHaves,
    niceToHaves: lists.niceToHaves,
  };
}

function lines(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildStartupRoleCopyPrompt(
  brief: StartupRoleBrief,
  options: { locale: StartupLocale; cvText?: string | null } = {
    locale: "en",
  },
): string {
  const nl = options.locale === "nl";
  const chunks: string[] = [];
  chunks.push(
    nl
      ? "Je helpt me solliciteren op deze geverifieerde vacature. Verzin geen werkgevers, titels, data of vaardigheden die niet in mijn CV staan."
      : "You are helping me apply to this sourced job posting. Do not invent employers, titles, dates, or skills I did not list.",
  );
  chunks.push("");
  chunks.push(
    nl
      ? `Rol: ${brief.title} bij ${brief.company}`
      : `Role: ${brief.title} at ${brief.company}`,
  );
  chunks.push(
    nl
      ? `Originele vacature: ${brief.sourceUrl}`
      : `Original posting: ${brief.sourceUrl}`,
  );
  if (brief.location) {
    chunks.push(
      nl ? `Locatie: ${brief.location}` : `Location: ${brief.location}`,
    );
  }
  if (brief.workType) {
    chunks.push(
      nl ? `Dienstverband: ${brief.workType}` : `Work type: ${brief.workType}`,
    );
  }
  if (brief.seniority) {
    chunks.push(
      nl
        ? `Senioriteit in de titel: ${brief.seniority}`
        : `Seniority in the title: ${brief.seniority}`,
    );
  }
  if (brief.languages.length > 0) {
    chunks.push(
      nl
        ? `Talen in de vacature: ${brief.languages.join(", ")}`
        : `Languages mentioned: ${brief.languages.join(", ")}`,
    );
  }
  if (brief.mustHaves.length > 0) {
    chunks.push("");
    chunks.push(
      nl
        ? "Must-haves (gekopieerd uit de vacature):"
        : "Must-haves (copied from the posting):",
    );
    chunks.push(lines(brief.mustHaves));
  }
  if (brief.niceToHaves.length > 0) {
    chunks.push("");
    chunks.push(
      nl
        ? "Nice-to-haves (gekopieerd uit de vacature):"
        : "Nice-to-haves (copied from the posting):",
    );
    chunks.push(lines(brief.niceToHaves));
  }
  const cv = presentText(options.cvText);
  chunks.push("");
  if (cv) {
    chunks.push(
      nl
        ? "Mijn CV (geüpload op AIT, alleen voor startup-sollicitaties):"
        : "My CV (uploaded on AIT for startup applications only):",
    );
    chunks.push(cv);
  } else {
    chunks.push(nl ? "Plak hieronder mijn CV." : "Paste my CV below.");
  }
  chunks.push("");
  chunks.push(
    nl
      ? "Schrijf een Role Brief die ik kan hergebruiken, daarna een CV-herschrijving die alleen herschikt en benadrukt wat al in mijn CV staat. Voeg nooit banen of skills toe."
      : "Write a Role Brief I can reuse, then a CV rewrite that only reorders and emphasizes what is already in my CV. Never add jobs or skills.",
  );
  return chunks.join("\n");
}
