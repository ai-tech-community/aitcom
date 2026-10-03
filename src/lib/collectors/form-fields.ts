import type {
  CollectorSummary,
  FieldHintSummary,
} from "@/server/collectors/runs";

/**
 * Turns a collector's JSON input schema plus its field hints into fields the
 * start form can draw. Adding a collector needs no UI code; a collector that
 * needs a new kind of field adds one kind here and one renderer
 * (field-renderers.tsx). Unknown kinds are refused, never drawn wrong.
 */
export type FieldKind = "url" | "text" | "number" | "checkbox" | "rows";

type FieldBase = {
  name: string;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
};

/**
 * How a single typed value is drawn. A number also says whether it takes
 * whole numbers only, so the renderer can pick the right keypad and step.
 */
type ScalarShape =
  | { kind: "url" }
  | { kind: "text" }
  | { kind: "number"; integer: boolean };

/** One column of a rows field: always a single typed value, never a list. */
export type FormColumn = FieldBase & ScalarShape;

/** How a field is drawn. */
type FieldShape =
  | ScalarShape
  | { kind: "checkbox" }
  | { kind: "rows"; min: number; max: number; columns: FormColumn[] };

/** A field the form can draw. */
export type FormField = FieldBase & FieldShape;

/** One row of a rows field, as typed: a cell per column name. */
export type RowValue = Record<string, string>;

export type FieldValue = string | boolean | RowValue[];

/** The most rows the form offers when the schema sets no upper bound. */
const DEFAULT_MAX_ROWS = 20;

type SchemaProperty = {
  type?: unknown;
  format?: unknown;
  enum?: unknown;
  const?: unknown;
  default?: unknown;
  minItems?: unknown;
  maxItems?: unknown;
  items?: SchemaObject;
};

type SchemaObject = {
  type?: unknown;
  properties?: Record<string, SchemaProperty>;
  required?: unknown;
};

function requiredNames(schema: SchemaObject): Set<string> {
  return new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
}

/**
 * Whether the member must fill a property. z.toJSONSchema lists a property
 * with a default as required (it describes the parsed output), but the member
 * may leave it empty.
 */
function mustFill(
  name: string,
  property: SchemaProperty,
  required: Set<string>,
): boolean {
  return required.has(name) && !("default" in property);
}

/**
 * How a single value is drawn, or null when no scalar kind fits it. A fixed
 * set of choices (`enum`/`const`) or a string format other than a web address
 * would need its own control and its own checks, so it is refused rather than
 * offered as free text the server would then reject.
 */
function scalarShape(property: SchemaProperty | undefined): ScalarShape | null {
  if (!property) return null;
  if ("enum" in property || "const" in property) return null;
  if (property.type === "string") {
    if (property.format === undefined) return { kind: "text" };
    return property.format === "uri" ? { kind: "url" } : null;
  }
  if (property.type === "integer") return { kind: "number", integer: true };
  if (property.type === "number") return { kind: "number", integer: false };
  return null;
}

/**
 * A list of objects drawn as rows: a column per hinted property, in hint
 * order. Refused when the hint names no columns, or a column is missing from
 * the schema or is not a single value (no rows inside rows).
 */
function rowsShape(
  property: SchemaProperty,
  columnHints: FieldHintSummary[] | null,
): FieldShape | null {
  const items = property.items;
  if (items?.type !== "object" || !columnHints?.length) return null;
  const required = requiredNames(items);
  const columns: FormColumn[] = [];
  for (const hint of columnHints) {
    const column = items.properties?.[hint.name];
    const shape = scalarShape(column);
    if (!column || !shape) return null;
    columns.push({
      ...hint,
      ...shape,
      required: mustFill(hint.name, column, required),
    });
  }
  return {
    kind: "rows",
    min: typeof property.minItems === "number" ? property.minItems : 0,
    max:
      typeof property.maxItems === "number"
        ? property.maxItems
        : DEFAULT_MAX_ROWS,
    columns,
  };
}

/** How a schema property is drawn, or null when no field kind fits it. */
function drawnAs(
  property: SchemaProperty,
  columnHints: FieldHintSummary[] | null,
): FieldShape | null {
  if ("enum" in property || "const" in property) return null;
  if (property.type === "boolean") return { kind: "checkbox" };
  if (property.type === "array") return rowsShape(property, columnHints);
  return scalarShape(property);
}

export function formFieldsFor(summary: {
  fields: CollectorSummary["fields"];
  inputJsonSchema: unknown;
}): { ok: true; fields: FormField[] } | { ok: false; unsupported: string[] } {
  const schema = (summary.inputJsonSchema ?? {}) as SchemaObject;
  const required = requiredNames(schema);
  const fields: FormField[] = [];
  const unsupported: string[] = [];
  for (const { columns, ...hint } of summary.fields) {
    const property = schema.properties?.[hint.name];
    const drawn = property ? drawnAs(property, columns) : null;
    if (!property || !drawn) {
      unsupported.push(hint.name);
      continue;
    }
    fields.push({
      ...hint,
      ...drawn,
      required: mustFill(hint.name, property, required),
    });
  }
  return unsupported.length ? { ok: false, unsupported } : { ok: true, fields };
}

/** What a field holds before the member touches it. */
export function initialValue(field: FormField): FieldValue {
  switch (field.kind) {
    case "checkbox":
      return false;
    case "rows":
      return Array.from({ length: Math.max(field.min, 1) }, () => ({}));
    default:
      return "";
  }
}

/**
 * One typed value, or undefined to leave it out: text is trimmed, numbers
 * become numbers, and an empty optional value is dropped. An empty required
 * value is kept so the server can point at it.
 */
function coerceScalar(
  field: FieldBase & ScalarShape,
  value: unknown,
): string | number | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") return field.required ? "" : undefined;
  return field.kind === "number" ? Number(text) : text;
}

/** A row as an object, or null when the member left every cell empty. */
function coerceRow(
  columns: FormColumn[],
  row: RowValue,
): Record<string, unknown> | null {
  const filled = columns.some((c) => (row[c.name] ?? "").trim() !== "");
  if (!filled) return null;
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    const value = coerceScalar(column, row[column.name]);
    if (value !== undefined) out[column.name] = value;
  }
  return out;
}

/** Form values → the collector's input. */
export function coerceInput(
  fields: FormField[],
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    switch (field.kind) {
      case "checkbox":
        input[field.name] = value === true;
        break;
      case "rows": {
        const rows = (Array.isArray(value) ? value : [])
          .map((row) => coerceRow(field.columns, row))
          .filter((row) => row !== null);
        if (rows.length > 0 || field.required) input[field.name] = rows;
        break;
      }
      default: {
        const scalar = coerceScalar(field, value);
        if (scalar !== undefined) input[field.name] = scalar;
      }
    }
  }
  return input;
}
