import { type FieldValue, type FormField, rowsToSend } from "./form-fields";
import {
  MAX_COMPOUNDS,
  MAX_SELECTOR_LENGTH,
  SELECTOR_PROBLEMS,
  type SelectorProblem,
} from "./selector-policy";

/**
 * Why the server refused a collector's input, as stable codes per input:
 * the full dotted path of the value ("url", "fields.2.selector") → codes.
 * Never sentences: the form (and later the MCP surface) words them in the
 * member's language.
 *
 * A collector's own checks give their code as `params.reason` on a custom
 * issue (`problemIssue`); any other check reports Zod's own issue code
 * (`invalid_format`, `too_small`, …), which the form words generally.
 */
export type InputProblems = Record<string, string[]>;

const SELECTOR_REFUSED = "selector_not_allowed/";

/** A selector the allowlist refused, and why. */
export function selectorRefused(reason: SelectorProblem): string {
  return `${SELECTOR_REFUSED}${reason}`;
}

/** Two columns (or other list entries) share one name. */
export const DUPLICATE_NAME = "duplicate_name";

/** The custom issue a collector's own check raises for `reason`. */
export function problemIssue(reason: string) {
  return { code: "custom" as const, message: reason, params: { reason } };
}

type Issue = {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly params?: unknown;
};

function reasonOf(issue: Issue): string {
  const reason = (issue.params as { reason?: unknown } | undefined)?.reason;
  return issue.code === "custom" && typeof reason === "string"
    ? reason
    : issue.code;
}

/** Zod's issues as codes per path (see `InputProblems`). */
export function inputProblemsOf(issues: readonly Issue[]): InputProblems {
  const problems: InputProblems = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    (problems[path] ??= []).push(reasonOf(issue));
  }
  return problems;
}

/** Where the form shows each problem. */
export type PlacedProblems = {
  /** Field name → codes shown under the whole field. */
  fields: Record<string, string[]>;
  /** Rows field name → row id → column name → codes shown at that cell. */
  cells: Record<string, Record<string, Record<string, string[]>>>;
};

/**
 * Places the server's problems on the inputs the member typed them in.
 * `sent` is what the form held when it sent the input: the server numbers
 * a rows field's rows by their place in `rowsToSend`, which skips rows the
 * member left empty. A problem with no precise row and column (the list as
 * a whole, a row number or column the form does not know) shows under the
 * whole field. Problems for fields the form does not draw are left out;
 * the form's general note covers them.
 */
export function placeProblems(
  fields: readonly FormField[],
  sent: Record<string, FieldValue>,
  problems: InputProblems,
): PlacedProblems {
  const placed: PlacedProblems = { fields: {}, cells: {} };
  for (const [path, codes] of Object.entries(problems)) {
    const [name, index, column, ...rest] = path.split(".");
    const field = fields.find((f) => f.name === name);
    if (!field) continue;
    if (
      field.kind === "rows" &&
      rest.length === 0 &&
      field.columns.some((c) => c.name === column)
    ) {
      const row = rowsToSend(field, sent[field.name])[Number(index)];
      if (row) {
        const cells = ((placed.cells[field.name] ??= {})[row.id] ??= {});
        (cells[column!] ??= []).push(...codes);
        continue;
      }
    }
    (placed.fields[field.name] ??= []).push(...codes);
  }
  return placed;
}

/** Message keys (in the `collectors` namespace) for codes with own words. */
export type ProblemCopyKey =
  | `start.problem.selector.${SelectorProblem}`
  | "start.problem.duplicate_name";

/** The numbers a selector message names. */
const SELECTOR_LIMITS: Partial<Record<SelectorProblem, number>> = {
  too_long: MAX_SELECTOR_LENGTH,
  too_complex: MAX_COMPOUNDS,
};

function isSelectorProblem(value: string): value is SelectorProblem {
  return (SELECTOR_PROBLEMS as readonly string[]).includes(value);
}

/**
 * The words for one code, or null when the code has none of its own (a
 * general check, or a code from a newer server): the field's own note
 * shows then.
 */
export function problemCopy(
  code: string,
): { key: ProblemCopyKey; values?: { max: number } } | null {
  if (code === DUPLICATE_NAME) {
    return { key: "start.problem.duplicate_name", values: undefined };
  }
  if (!code.startsWith(SELECTOR_REFUSED)) return null;
  const reason = code.slice(SELECTOR_REFUSED.length);
  if (!isSelectorProblem(reason)) return null;
  const max = SELECTOR_LIMITS[reason];
  return {
    key: `start.problem.selector.${reason}`,
    values: max === undefined ? undefined : { max },
  };
}
