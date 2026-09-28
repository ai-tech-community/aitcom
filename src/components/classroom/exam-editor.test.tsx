import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import { ExamEditor } from "./exam-editor";

function wrap(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}

const value = {
  mandatory: false,
  passThreshold: 70,
  maxAttempts: 0,
  questions: [
    {
      id: "a",
      prompt: "Q1",
      type: "single" as const,
      options: ["x", "y"],
      correctIndex: 0,
    },
    {
      id: "b",
      prompt: "Q2",
      type: "single" as const,
      options: ["z", "w"],
      correctIndex: 1,
    },
  ],
};

describe("ExamEditor", () => {
  it("gives two editors on one page distinct checkbox ids and radio groups", () => {
    render(
      wrap(
        <>
          <ExamEditor value={value} onChange={vi.fn()} />
          <ExamEditor value={value} onChange={vi.fn()} />
        </>,
      ),
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(new Set(boxes.map((b) => b.id)).size).toBe(boxes.length);
    // Same question ids in both editors: the correct-answer radio groups must
    // still be separate, or picking an answer in one clears the other.
    const [first, second] = screen
      .getAllByRole("radiogroup")
      .reduce<string[][]>(
        (editors, group, i) => {
          const names = Array.from(
            group.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
            (r) => r.name,
          );
          editors[i < 2 ? 0 : 1]!.push(...new Set(names));
          return editors;
        },
        [[], []],
      );
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    for (const name of first!) expect(second).not.toContain(name);
  });

  it("labels every input and names each correct-answer choice by question and option", () => {
    render(wrap(<ExamEditor value={value} onChange={vi.fn()} />));
    for (const input of screen.getAllByRole("textbox"))
      expect(input).toHaveAccessibleName();
    for (const input of screen.getAllByRole("spinbutton"))
      expect(input).toHaveAccessibleName();
    const radios = screen.getAllByRole("radio");
    expect(new Set(radios.map((r) => r.getAttribute("aria-label"))).size).toBe(
      radios.length,
    );
  });

  it("groups each question's correct-answer radios in a labelled radiogroup", () => {
    render(wrap(<ExamEditor value={value} onChange={vi.fn()} />));
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(2);
    for (const group of groups) expect(group).toHaveAccessibleName();
  });
});
