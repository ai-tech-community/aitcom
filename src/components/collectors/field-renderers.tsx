"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  FieldKind,
  FieldValue,
  FormColumn,
  FormField,
  RowValue,
} from "@/lib/collectors/form-fields";

export type FieldRendererProps = {
  field: FormField;
  id: string;
  value: FieldValue;
  error: string | null;
  onChange: (value: FieldValue) => void;
};

export type FieldRenderer = (props: FieldRendererProps) => React.ReactNode;

function describedBy(id: string, field: FormField, error: string | null) {
  return (
    [field.help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

function FieldNotes({
  id,
  field,
  error,
}: {
  id: string;
  field: FormField;
  error: string | null;
}) {
  return (
    <>
      {field.help ? (
        <p id={`${id}-help`} className="text-muted-foreground text-[13px]">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-[13px]">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Whole numbers get a digits-only keypad; decimals keep the decimal point. */
function numberHints(field: FormField | FormColumn) {
  if (field.kind !== "number") return {};
  return field.integer
    ? { inputMode: "numeric" as const, step: 1 }
    : { inputMode: "decimal" as const, step: "any" };
}

function textual(type: "url" | "text" | "number"): FieldRenderer {
  return function TextualField({ field, id, value, error, onChange }) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Input
          id={id}
          type={type}
          {...numberHints(field)}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          value={typeof value === "string" ? value : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, field, error)}
          onChange={(e) => onChange(e.target.value)}
        />
        <FieldNotes id={id} field={field} error={error} />
      </div>
    );
  };
}

function CheckboxField({
  field,
  id,
  value,
  error,
  onChange,
}: FieldRendererProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={id}
          tone="ink"
          checked={value === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, field, error)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={id}>{field.label}</Label>
      </div>
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

/**
 * A list the member builds row by row, such as the columns of a table: one
 * labelled input per column in each row, with buttons to add and remove rows
 * within the field's bounds. The column names and their help show once, as
 * headings on wide screens and as a short key above stacked rows on narrow
 * ones; each input keeps its own label (visible only on narrow screens).
 */
function RowsField({ field, id, value, error, onChange }: FieldRendererProps) {
  const t = useTranslations("collectors.start");
  // After adding or removing a row, focus moves to the element with this id,
  // so keyboard users are never left on a button that has gone away.
  const focusNext = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  if (field.kind !== "rows") return null;
  const { columns, min, max } = field;
  const rows: RowValue[] = Array.isArray(value) ? value : [];
  const cellId = (row: number, column: string) => `${id}-${row}-${column}`;
  const columnHelpId = (column: string) => `${id}-column-${column}-help`;
  const removeId = (row: number) => `${id}-${row}-remove`;
  const addId = `${id}-add`;
  const grid = {
    "--row-columns": columns.length,
  } as React.CSSProperties;
  const gridClass =
    "grid gap-3 md:grid-cols-[repeat(var(--row-columns),minmax(0,1fr))_2.25rem] md:items-start";

  function setCell(row: number, column: string, cell: string) {
    onChange(rows.map((r, i) => (i === row ? { ...r, [column]: cell } : r)));
  }

  function addRow() {
    focusNext.current = cellId(rows.length, columns[0]!.name);
    onChange([...rows, {}]);
  }

  function removeRow(row: number) {
    const left = rows.length - 1;
    // Stay on the remove button at the same place (now the next row's), or
    // step back one row; land on "Add" once no row can be removed any more.
    focusNext.current = left <= min ? addId : removeId(Math.min(row, left - 1));
    onChange(rows.filter((_, i) => i !== row));
  }

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      aria-describedby={describedBy(id, field, error)}
    >
      <legend className="mb-1.5 text-sm leading-none font-medium">
        {field.label}
      </legend>
      {field.help ? (
        <p
          id={`${id}-help`}
          className="text-muted-foreground -mt-1.5 text-[13px]"
        >
          {field.help}
        </p>
      ) : null}

      <div aria-hidden="true" className={gridClass} style={grid}>
        {columns.map((column) => (
          <div key={column.name} className="flex flex-col gap-1">
            <span className="text-sm leading-none font-medium">
              {column.label}
            </span>
            {column.help ? (
              <span
                id={columnHelpId(column.name)}
                className="text-muted-foreground text-[13px]"
              >
                {column.help}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div
            key={i}
            role="group"
            aria-label={t("row", { n: i + 1 })}
            className={`${gridClass} border-border border-t pt-3 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0`}
            style={grid}
          >
            {columns.map((column) => (
              <div key={column.name} className="flex flex-col gap-1.5">
                <Label htmlFor={cellId(i, column.name)} className="md:sr-only">
                  {column.label}
                </Label>
                <Input
                  id={cellId(i, column.name)}
                  type={column.kind}
                  {...numberHints(column)}
                  required={column.required}
                  placeholder={column.placeholder ?? undefined}
                  value={row[column.name] ?? ""}
                  aria-describedby={
                    column.help ? columnHelpId(column.name) : undefined
                  }
                  onChange={(e) => setCell(i, column.name, e.target.value)}
                />
              </div>
            ))}
            <Button
              id={removeId(i)}
              type="button"
              variant="ghost"
              size="icon"
              className="justify-self-end md:justify-self-auto"
              aria-label={t("removeRow", { n: i + 1 })}
              disabled={rows.length <= min}
              onClick={() => removeRow(i)}
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        id={addId}
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={rows.length >= max}
        onClick={addRow}
      >
        <PlusIcon aria-hidden="true" />
        {t("addRow")}
      </Button>
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-[13px]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** One renderer per field kind (Strategy): a new kind is one more entry. */
export const FIELD_RENDERERS: Record<FieldKind, FieldRenderer> = {
  url: textual("url"),
  text: textual("text"),
  number: textual("number"),
  checkbox: CheckboxField,
  rows: RowsField,
};

/**
 * The note a field shows when the server rejects its value, as a key in the
 * `collectors` messages. An address has one fixed rule, so it says it; other
 * kinds ask the member to check the field.
 */
export const FIELD_REJECTION_KEYS: Record<
  FieldKind,
  "start.invalidUrl" | "start.invalidField"
> = {
  url: "start.invalidUrl",
  text: "start.invalidField",
  number: "start.invalidField",
  checkbox: "start.invalidField",
  rows: "start.invalidField",
};
