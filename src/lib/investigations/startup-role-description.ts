import { presentText } from "./startups";

export type StartupRoleDescriptionBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const BULLET = /^(?:[-*•]|\d+[.)])\s+/;

const KNOWN_HEADING =
  /^(about(?: the (?:role|company|team|job|position)|(?:\s+[a-z0-9][\w'-]*){1,3})?|the role|overview|introduction|responsibilities|key responsibilities|what you.?ll do|what we (?:do|offer)|what we.?re looking for|who you are|who we are|our mission|about us|the team|requirements?|must[- ]haves?|minimum qualifications?|preferred qualifications?|qualifications?|nice[- ]to[- ]haves?|bonus(?: points)?|you (?:have|are)|benefits|compensation|perks(?:\s*&\s*benefits)?|equal opportunity|how to apply|interview process|why join(?: us)?|why us|location|reports? to)$/i;

function stripColon(line: string): string {
  return line.replace(/[:?]+\s*$/, "").trim();
}

function isBullet(line: string): boolean {
  return BULLET.test(line);
}

function stripBullet(line: string): string {
  return line.replace(BULLET, "").trim();
}

function isKnownHeading(line: string): boolean {
  return KNOWN_HEADING.test(stripColon(line));
}

function looksLikeHeading(line: string, next: string | undefined): boolean {
  const text = stripColon(line);
  if (text.length < 2 || text.length > 72) return false;
  if (isBullet(line)) return false;
  if (isKnownHeading(line)) return true;
  if (
    /[A-Z0-9]/.test(text) &&
    text === text.toUpperCase() &&
    /[A-Z]/.test(text)
  ) {
    return true;
  }
  if (/[.!?]/.test(text)) return false;
  if (/\d/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  const following = presentText(next);
  if (!following) return false;
  if (isBullet(following) || isKnownHeading(following)) return true;
  return text.length <= 48 && following.length > text.length;
}

export function parseStartupRoleDescription(
  value: string | null | undefined,
): StartupRoleDescriptionBlock[] {
  const source = presentText(value);
  if (!source) return [];
  const lines = source.split(/\n/);
  const blocks: StartupRoleDescriptionBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    const next = lines[index + 1];
    if (looksLikeHeading(line, next)) {
      blocks.push({ type: "heading", text: stripColon(line) });
      index += 1;
      continue;
    }
    if (isBullet(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const raw = lines[index]?.trim() ?? "";
        if (!raw) {
          const peek = lines[index + 1]?.trim() ?? "";
          if (isBullet(peek)) {
            index += 1;
            continue;
          }
          break;
        }
        if (!isBullet(raw)) break;
        const item = presentText(stripBullet(raw));
        if (item) items.push(item);
        index += 1;
      }
      if (items.length > 0) blocks.push({ type: "list", items });
      continue;
    }
    const parts: string[] = [];
    while (index < lines.length) {
      const raw = lines[index]?.trim() ?? "";
      if (!raw) break;
      if (isBullet(raw) || looksLikeHeading(raw, lines[index + 1])) break;
      parts.push(raw);
      index += 1;
    }
    const paragraph = presentText(parts.join(" "));
    if (paragraph) blocks.push({ type: "paragraph", text: paragraph });
  }

  return blocks;
}
