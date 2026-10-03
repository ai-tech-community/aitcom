import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type FieldValue,
  type FormField,
  initialValue,
} from "@/lib/collectors/form-fields";

import en from "../../../messages/en.json";
import { FIELD_REJECTION_KEYS, FIELD_RENDERERS } from "./field-renderers";

function renderNumber(integer: boolean) {
  const field: FormField = {
    name: "n",
    label: "Amount",
    help: null,
    placeholder: null,
    kind: "number",
    integer,
    required: false,
  };
  const Render = FIELD_RENDERERS.number;
  render(
    <Render
      field={field}
      id="field-n"
      value=""
      error={null}
      onChange={vi.fn()}
    />,
  );
  return screen.getByLabelText("Amount");
}

describe("FIELD_RENDERERS.number", () => {
  it("asks for a whole-number keypad for an integer field", () => {
    const input = renderNumber(true);
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("step", "1");
  });

  it("asks for a decimal keypad for a decimal field", () => {
    const input = renderNumber(false);
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("step", "any");
  });
});

const columnsField: FormField = {
  name: "fields",
  label: "Columns",
  help: "What to read from each item.",
  placeholder: null,
  kind: "rows",
  required: true,
  min: 1,
  max: 3,
  columns: [
    {
      name: "name",
      label: "Column name",
      help: "Start with a letter.",
      placeholder: "title",
      kind: "text",
      required: true,
    },
    {
      name: "selector",
      label: "Selector",
      help: null,
      placeholder: "h3 a",
      kind: "text",
      required: true,
    },
  ],
};

/** The rows renderer, holding its value the way the start form does. */
function RowsHarness({
  error,
  onChange,
}: {
  error: string | null;
  onChange: (v: FieldValue) => void;
}) {
  const Render = FIELD_RENDERERS.rows;
  const [value, setValue] = React.useState<FieldValue>(() =>
    initialValue(columnsField),
  );
  return (
    <Render
      field={columnsField}
      id="field-fields"
      value={value}
      error={error}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

function renderRows(error: string | null = null) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RowsHarness error={error} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

const addButton = () =>
  screen.getByRole("button", { name: en.collectors.start.addRow });
const removeButton = (n: number) =>
  screen.getByRole("button", { name: `Remove column ${n}` });

describe("FIELD_RENDERERS.rows", () => {
  it("draws a labelled group with one row to start and a label on every input", () => {
    renderRows();
    const group = screen.getByRole("group", { name: "Columns" });
    expect(group).toHaveAccessibleDescription("What to read from each item.");
    expect(within(group).getAllByLabelText("Column name")).toHaveLength(1);
    expect(within(group).getAllByLabelText("Selector")).toHaveLength(1);
    expect(screen.getByLabelText("Column name")).toHaveAccessibleDescription(
      "Start with a letter.",
    );
    expect(screen.getByLabelText("Column name")).toHaveAttribute(
      "placeholder",
      "title",
    );
  });

  it("adds rows up to the maximum and removes them down to the minimum", () => {
    const { onChange } = renderRows();
    expect(removeButton(1)).toBeDisabled();
    fireEvent.click(addButton());
    fireEvent.click(addButton());
    expect(screen.getAllByLabelText("Column name")).toHaveLength(3);
    expect(addButton()).toBeDisabled();
    expect(removeButton(1)).toBeEnabled();

    const row2 = screen.getByRole("group", { name: "Column 2" });
    fireEvent.change(within(row2).getByLabelText("Column name"), {
      target: { value: "link" },
    });
    expect(onChange).toHaveBeenLastCalledWith([{}, { name: "link" }, {}]);

    fireEvent.click(removeButton(1));
    expect(onChange).toHaveBeenLastCalledWith([{ name: "link" }, {}]);
    expect(addButton()).toBeEnabled();
    expect(screen.getAllByLabelText("Column name")[0]).toHaveValue("link");
    fireEvent.click(removeButton(2));
    expect(screen.getAllByLabelText("Column name")).toHaveLength(1);
    expect(removeButton(1)).toBeDisabled();
  });

  it("shows the field's error under the group and points the group at it", () => {
    renderRows("Check this field.");
    const group = screen.getByRole("group", { name: "Columns" });
    expect(group).toHaveAccessibleDescription(
      "What to read from each item. Check this field.",
    );
  });
});

describe("FIELD_REJECTION_KEYS", () => {
  it("tells an address field what a valid address looks like", () => {
    expect(FIELD_REJECTION_KEYS.url).toBe("start.invalidUrl");
  });

  it("keeps the general note for every other kind", () => {
    expect(FIELD_REJECTION_KEYS.text).toBe("start.invalidField");
    expect(FIELD_REJECTION_KEYS.number).toBe("start.invalidField");
    expect(FIELD_REJECTION_KEYS.checkbox).toBe("start.invalidField");
    expect(FIELD_REJECTION_KEYS.rows).toBe("start.invalidField");
  });
});
