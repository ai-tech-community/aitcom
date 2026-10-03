import type { CollectorSummary } from "@/server/collectors/runs";

/**
 * Turns a collector's JSON input schema plus its field hints into fields the
 * start form can draw. Adding a collector needs no UI code; a collector that
 * needs a new kind of field adds one kind here and one renderer
 * (field-renderers.tsx). Unknown kinds are refused, never drawn wrong.
 */
export type FieldKind = "url" | "text" | "number" | "checkbox";

type FieldBase = {
  name: string;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
};

/**
 * How a field is drawn. A number field also says whether it takes whole
 * numbers only, so the renderer can pick the right keypad and step.
 */
type FieldShape =
  | { kind: Exclude<FieldKind, "number"> }
  | { kind: "number"; integer: boolean };

/** A field the form can draw. */
export type FormField = FieldBase & FieldShape;

export type FieldValue = string | boolean;

type SchemaProperty = {
  type?: unknown;
  format?: unknown;
  enum?: unknown;
  const?: unknown;
  default?: unknown;
};

/**
 * How a schema property is drawn, or null when no field kind fits it. A fixed
 * set of choices (`enum`/`const`) or a string format other than a web address
 * would need its own control and its own checks, so it is refused rather than
 * offered as free text the server would then reject.
 */
function drawnAs(property: SchemaProperty | undefined): FieldShape | null {
  if (!property) return null;
  if ("enum" in property || "const" in property) return null;
  if (property.type === "string") {
    if (property.format === undefined) return { kind: "text" };
    return property.format === "uri" ? { kind: "url" } : null;
  }
  if (property.type === "integer") return { kind: "number", integer: true };
  if (property.type === "number") return { kind: "number", integer: false };
  if (property.type === "boolean") return { kind: "checkbox" };
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
    const property = schema.properties?.[hint.name];
    const drawn = drawnAs(property);
    if (!drawn) {
      unsupported.push(hint.name);
      continue;
    }
    // z.toJSONSchema lists a field with a default as required (it describes
    // the parsed output), but the member may leave it empty.
    const hasDefault = property !== undefined && "default" in property;
    fields.push({
      ...hint,
      ...drawn,
      required: required.has(hint.name) && !hasDefault,
    });
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
