import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/trpc/react", () => ({ api: {} }));

import en from "../../../messages/en.json";
import { RichTextEditor } from "./rich-text-editor";

describe("RichTextEditor accessible name", () => {
  it("names and describes its writing surface by the given label and hint", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <p id="note-label">Editor&apos;s note</p>
        <RichTextEditor
          onChange={vi.fn()}
          ariaLabelledBy="note-label"
          ariaDescribedBy="note-hint"
        />
        <p id="note-hint">A short welcome at the top of the issue.</p>
      </NextIntlClientProvider>,
    );

    const surface = await screen.findByRole("textbox", {
      name: "Editor's note",
    });
    expect(surface).toHaveAttribute("contenteditable", "true");
    expect(surface).toHaveAccessibleDescription(
      "A short welcome at the top of the issue.",
    );
  });
});
