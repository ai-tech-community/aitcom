import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  // `dark:bg-input/30` outranks a plain checked fill in dark mode, so each tone
  // needs its own dark checked fill or a ticked box looks empty there.
  it.each([
    ["ink", "dark:data-[state=checked]:bg-foreground"],
    ["primary", "dark:data-[state=checked]:bg-primary"],
  ] as const)("keeps the %s tick filled in dark mode", (tone, fill) => {
    render(<Checkbox aria-label="Pick" tone={tone} defaultChecked />);
    expect(screen.getByRole("checkbox", { name: "Pick" })).toHaveClass(fill);
  });
});
