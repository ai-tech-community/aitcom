import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { plainTextToLexical } from "@/server/challenge-engine/lexical";

import { LessonBody } from "./lesson-body";

const markdown = [
  "## Goals",
  "- Say the Dutch alphabet",
  "",
  "| Dutch | English |",
  "|---|---|",
  "| een | one |",
  "",
  "```",
  "A: Hoe spel je 'huis'?",
  "```",
  "",
  "See the [alphabet](https://example.com/alphabet).",
  "",
  "<script>alert(1)</script>",
  "",
  "[click](javascript:alert(1))",
].join("\n");

it("renders stored markdown as headings, lists, tables, code, and links", () => {
  render(<LessonBody content={plainTextToLexical(markdown)} />);

  expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
  expect(screen.getByText("Say the Dutch alphabet")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "een" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "one" })).toBeInTheDocument();
  expect(screen.getByText("A: Hoe spel je 'huis'?")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "alphabet" });
  expect(link).toHaveAttribute("href", "https://example.com/alphabet");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

it("does not turn raw html or a javascript url into an element", () => {
  const { container } = render(
    <LessonBody content={plainTextToLexical(markdown)} />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText(/alert\(1\)/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "click" })).toBeNull();
  expect(screen.getByText("click")).toBeInTheDocument();
});
