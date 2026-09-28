import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

// The extension list also registers the file node, which talks to the API
// only when one is on screen; none is here.
vi.mock("@/trpc/react", () => ({ api: {} }));

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { filterSlashCommands } from "@/components/article-editor/utils";
import en from "../../../../messages/en.json";
import { classroomEditorExtensions } from "./editor-extensions";

type Node = {
  type?: string;
  fields?: { blockType?: string };
  children?: Node[];
};

function hasEmbedBlock(state: unknown): boolean {
  const walk = (nodes: Node[] | undefined): boolean =>
    (nodes ?? []).some(
      (n) =>
        (n.type === "block" && n.fields?.blockType === "Embed") ||
        walk(n.children),
    );
  return walk(
    (state as { root?: { children?: Node[] } } | null)?.root?.children,
  );
}

describe("lesson editor: inserting an Embed", () => {
  it("the toolbar button puts an Embed block into the saved lesson body", async () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RichTextEditor
          onChange={onChange}
          extensions={classroomEditorExtensions}
        />
      </NextIntlClientProvider>,
    );

    const button = await screen.findByTitle("Embed slides or video");
    await waitFor(() => expect(button).toBeEnabled());

    // Put the caret in the editor the way an author would: click into it.
    const editable = document.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    act(() => {
      editable.focus();
      fireEvent.click(editable);
    });

    fireEvent.click(button);

    await waitFor(
      () => {
        const latest = onChange.mock.lastCall?.[0];
        expect(hasEmbedBlock(latest)).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it("the slash menu offers the Embed command for 'slides'", () => {
    const commands = classroomEditorExtensions.flatMap((e) =>
      e.command ? [e.command] : [],
    );
    expect(filterSlashCommands("slides", commands).map((c) => c.id)).toContain(
      "embed",
    );
    // Without upload rights the file block is registered but not offered.
    expect(
      filterSlashCommands("file", commands).map((c) => c.id),
    ).not.toContain("hosted-file");
  });
});
