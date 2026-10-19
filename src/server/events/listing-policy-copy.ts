import type { CollectionBeforeChangeHook } from "payload";

import {
  repairEventEncoding,
  stripListingPolicy,
} from "@/lib/events/listing-policy";
import {
  lexicalToPlainText,
  plainTextToLexical,
} from "@/server/challenge-engine/lexical";

function plainFromStored(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return lexicalToPlainText(JSON.parse(trimmed) as unknown);
      } catch {
        return value;
      }
    }
    return value;
  }
  return lexicalToPlainText(value);
}

/**
 * Strip listing-policy notes from a Payload description. Unchanged rich text
 * is returned as-is so a clean save does not rewrite formatting.
 */
export function stripListingPolicyLexical(value: unknown): unknown {
  if (typeof value === "string") return stripListingPolicy(value);
  const plain = lexicalToPlainText(value);
  const stripped = stripListingPolicy(plain);
  if (stripped === plain) return value;
  return plainTextToLexical(stripped);
}

/**
 * CMS beforeChange: every Payload insert and update of an event, including
 * the admin panel, passes through here.
 */
export const stripEventCopyBeforeChange: CollectionBeforeChangeHook = ({
  data,
}) => {
  if (!data) return data;
  if (typeof data.title === "string") {
    data.title = repairEventEncoding(data.title);
  }
  if (typeof data.summary === "string") {
    data.summary = stripListingPolicy(data.summary);
  }
  if (data.description != null) {
    data.description = stripListingPolicyLexical(data.description);
  }
  return data;
};

export type StoredEventCopy = {
  summary: string | null;
  description: unknown;
};

export function cleanedEventCopy(row: StoredEventCopy): {
  summary: string | null;
  description: unknown;
  changed: boolean;
} {
  const summary =
    typeof row.summary === "string" ? stripListingPolicy(row.summary) : null;
  const plain = plainFromStored(row.description);
  const stripped = stripListingPolicy(plain);
  const descriptionChanged = stripped !== plain;
  return {
    summary,
    description: descriptionChanged
      ? plainTextToLexical(stripped)
      : row.description,
    changed: summary !== row.summary || descriptionChanged,
  };
}
