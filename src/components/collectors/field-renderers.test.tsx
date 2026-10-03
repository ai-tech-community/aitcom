import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FormField } from "@/lib/collectors/form-fields";
import { FIELD_RENDERERS } from "./field-renderers";

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
