import type { CollectorSummary } from "@/server/collectors/runs";

/**
 * Turns a collector's JSON input schema plus its field hints into fields the
 * start form can draw. Adding a collector needs no UI code; a collector that
 * needs a new kind of field adds one kind here and one renderer
 * (field-renderers.tsx). Unknown kinds are refused, never drawn wrong.
 */
export type FieldKind = "url" | "text" | "number" | "checkbox";

export type FormField = {
  name: string;
  label: string;
  help: string | null;
  placeholder: string | null;
  kind: FieldKind;
  required: boolean;
};

export type FieldValue = string | boolean;

type SchemaProperty = { type?: unknown; format?: unknown };

function kindOf(property: SchemaProperty | undefined): FieldKind | null {
  if (!property) return null;
  if (property.type === "string") {
    return property.format === "uri" ? "url" : "text";
  }
  if (property.type === "number" || property.type === "integer") {
    return "number";
  }
  if (property.type === "boolean") return "checkbox";
  return null;
}

export function formFieldsFor(summary: {
  fields: CollectorSummary["fields"];
  inputJsonSchema: unknown;
}): { ok: true; fields: FormField[] } | { ok: false; unsupported: string[] } {
  const schema = (summary.inputJsonSchema ?? {}) as {
    properties?: Record<string, SchemaProperty>;
    required?: unknown;
  };
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const fields: FormField[] = [];
  const unsupported: string[] = [];
  for (const hint of summary.fields) {
    const kind = kindOf(schema.properties?.[hint.name]);
    if (kind) fields.push({ ...hint, kind, required: required.has(hint.name) });
    else unsupported.push(hint.name);
  }
  return unsupported.length ? { ok: false, unsupported } : { ok: true, fields };
}

/** Form values → the collector's input: trimmed text, real numbers, booleans. */
export function coerceInput(
  fields: FormField[],
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === "checkbox") {
      input[field.name] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "" && !field.required) continue;
    input[field.name] =
      field.kind === "number" && text !== "" ? Number(text) : text;
  }
  return input;
}
