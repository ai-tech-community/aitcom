"use client";

import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  FieldKind,
  FieldValue,
  FormField,
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
function numberHints(field: FormField) {
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

/** One renderer per field kind (Strategy): a new kind is one more entry. */
export const FIELD_RENDERERS: Record<FieldKind, FieldRenderer> = {
  url: textual("url"),
  text: textual("text"),
  number: textual("number"),
  checkbox: CheckboxField,
};
