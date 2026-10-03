/**
 * Dataset export formats (Strategy): one formatter per format, all
 * streaming, so a new format is one more entry.
 */
export interface ExportFormat {
  extension: string;
  contentType: string;
  write(
    rows: AsyncIterable<Record<string, unknown>>,
    columns: readonly string[] | null,
  ): AsyncIterable<string>;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Scalars as written; objects and arrays as JSON; anything else empty. */
function cellText(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return "";
}

/**
 * One CSV cell: formula-safe (OWASP CSV injection) and RFC 4180 quoted.
 * A number cannot carry a formula, so -5 stays -5; text "-5" is guarded.
 */
export function csvCell(value: unknown): string {
  let text = cellText(value);
  if (typeof value !== "number" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csv: ExportFormat = {
  extension: "csv",
  contentType: "text/csv; charset=utf-8",
  async *write(rows, columns) {
    let header: readonly string[] | null = columns;
    if (header) yield `${header.map(csvCell).join(",")}\r\n`;
    for await (const row of rows) {
      if (!header) {
        header = Object.keys(row);
        yield `${header.map(csvCell).join(",")}\r\n`;
      }
      yield `${header.map((c) => csvCell(row[c])).join(",")}\r\n`;
    }
  },
};

const json: ExportFormat = {
  extension: "json",
  contentType: "application/json; charset=utf-8",
  async *write(rows) {
    yield "[";
    let first = true;
    for await (const row of rows) {
      yield `${first ? "\n" : ",\n"}${JSON.stringify(row)}`;
      first = false;
    }
    yield first ? "]" : "\n]";
  },
};

export const EXPORT_FORMATS = { csv, json } satisfies Record<
  string,
  ExportFormat
>;
export type ExportFormatId = keyof typeof EXPORT_FORMATS;
