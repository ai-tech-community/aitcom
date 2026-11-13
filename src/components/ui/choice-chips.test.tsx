import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ChoiceChips } from "./choice-chips";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "wins", label: "⭐ Wins" },
  { value: "jobs", label: "Jobs" },
];

describe("ChoiceChips", () => {
  it("is a named radio group with one radio per option", () => {
    render(
      <ChoiceChips
        aria-label="Topic"
        options={OPTIONS}
        value="wins"
        onValueChange={vi.fn()}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Topic" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "All",
      "⭐ Wins",
      "Jobs",
    ]);
    expect(within(group).getByRole("radio", { name: "⭐ Wins" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "All" })).not.toBeChecked();
  });

  it("reports the chosen value", () => {
    const onValueChange = vi.fn();
    render(
      <ChoiceChips
        aria-label="Topic"
        options={OPTIONS}
        value="all"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Jobs" }));
    expect(onValueChange).toHaveBeenCalledWith("jobs");
  });

  it("gives each group its own radio name", () => {
    render(
      <>
        <ChoiceChips
          aria-label="A"
          options={OPTIONS}
          value="all"
          onValueChange={vi.fn()}
        />
        <ChoiceChips
          aria-label="B"
          options={OPTIONS}
          value="all"
          onValueChange={vi.fn()}
        />
      </>,
    );
    const [a, b] = screen.getAllByRole("radiogroup");
    const nameOf = (group: HTMLElement) =>
      within(group).getAllByRole("radio")[0]!.getAttribute("name");
    expect(nameOf(a!)).not.toBe(nameOf(b!));
  });
});
