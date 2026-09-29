import { z } from "zod";

/**
 * First and last name on a member's account (ADR-0038). The event organizer
 * sees them; the member types them once, at the first registration that
 * needs them, starting from a suggestion split out of their current name.
 */

export const PERSON_NAME_MAX = 100;

/** Trim, and collapse runs of whitespace to one space. */
export function cleanPersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** A first or last name as stored: cleaned, 1–100 characters. */
export const personNameSchema = z
  .string()
  .transform(cleanPersonName)
  .pipe(z.string().min(1).max(PERSON_NAME_MAX));

/**
 * A starting point for the name fields, split on the first space: "Jan van
 * der Berg" → Jan / van der Berg. Only a suggestion — splitting names by
 * rule is wrong often enough that the member always confirms it.
 */
export function suggestNameParts(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const clean = cleanPersonName(name ?? "");
  if (!clean) return { firstName: "", lastName: "" };
  const space = clean.indexOf(" ");
  return space === -1
    ? { firstName: clean, lastName: "" }
    : { firstName: clean.slice(0, space), lastName: clean.slice(space + 1) };
}

/** Whether the account already holds both names. */
export function hasAccountNames(account: {
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  return (
    cleanPersonName(account.firstName ?? "").length > 0 &&
    cleanPersonName(account.lastName ?? "").length > 0
  );
}
