import {
  type FieldValue,
  type FormField,
  initialValue,
  newRow,
} from "./form-fields";
import type { PlacedProblems } from "./input-problems";

/**
 * A preset's fields split for the start page: the asked ones up front (in
 * the preset's order) and the rest behind "Show settings" (in form order).
 */
export function splitFields(
  fields: readonly FormField[],
  ask: readonly string[],
): { asked: FormField[]; settings: FormField[] } {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const asked = ask.flatMap((name) => {
    const field = byName.get(name);
    return field ? [field] : [];
  });
  const askedNames = new Set(asked.map((f) => f.name));
  return { asked, settings: fields.filter((f) => !askedNames.has(f.name)) };
}

/** A stored or pasted value as the form holds it; a value that does not fit starts empty. */
export function formValueOf(field: FormField, raw: unknown): FieldValue {
  switch (field.kind) {
    case "checkbox":
      return raw === true || raw === "true";
    case "rows": {
      if (!Array.isArray(raw)) return initialValue(field);
      const rows = raw
        .filter(
          (r): r is Record<string, unknown> =>
            r !== null && typeof r === "object",
        )
        .map((r) => {
          const row = newRow();
          for (const column of field.columns) {
            const value = r[column.name];
            if (typeof value === "string" || typeof value === "number") {
              row.cells[column.name] = String(value);
            }
          }
          return row;
        });
      return rows.length > 0 ? rows : initialValue(field);
    }
    default:
      return typeof raw === "string" || typeof raw === "number"
        ? String(raw)
        : initialValue(field);
  }
}

/**
 * What each field holds when a preset's start page opens: the pasted value,
 * else the preset's own (Prototype: the member copies `base` and adjusts),
 * else empty. Only the preset's own field names are read.
 */
export function presetInitialValues(
  fields: readonly FormField[],
  base: Record<string, unknown>,
  prefill: Record<string, string>,
): Record<string, FieldValue> {
  return Object.fromEntries(
    fields.map((field) => {
      if (Object.hasOwn(prefill, field.name)) {
        return [field.name, formValueOf(field, prefill[field.name])];
      }
      if (Object.hasOwn(base, field.name)) {
        return [field.name, formValueOf(field, base[field.name])];
      }
      return [field.name, initialValue(field)];
    }),
  );
}

/** Whether the server placed a problem on any of these fields or their cells. */
export function hasProblemIn(
  fields: readonly FormField[],
  placed: PlacedProblems,
): boolean {
  return fields.some(
    (f) =>
      (placed.fields[f.name]?.length ?? 0) > 0 ||
      placed.cells[f.name] !== undefined,
  );
}
