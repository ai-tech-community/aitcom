import { describe, expect, it } from "vitest";

import { forumBodyToLexical } from "./forum-body";

function children(body: string) {
  return forumBodyToLexical(body).root.children;
}

describe("forumBodyToLexical", () => {
  it("turns a markdown link and a bare URL into link nodes", () => {
    const [paragraph] = children(
      "Read the [docs](https://example.com/docs) or https://example.com/more.",
    );
    expect(paragraph?.children).toEqual([
      expect.objectContaining({ type: "text", text: "Read the " }),
      expect.objectContaining({
        type: "link",
        url: "https://example.com/docs",
        children: [expect.objectContaining({ text: "docs" })],
      }),
      expect.objectContaining({ type: "text", text: " or " }),
      expect.objectContaining({
        type: "link",
        url: "https://example.com/more",
      }),
      expect.objectContaining({ type: "text", text: "." }),
    ]);
  });

  it("keeps bold and italic the toolbar inserts", () => {
    const [paragraph] = children("A **bold** and _italic_ word.");
    expect(paragraph?.children).toEqual([
      expect.objectContaining({ text: "A ", format: 0 }),
      expect.objectContaining({ text: "bold", format: 1 }),
      expect.objectContaining({ text: " and ", format: 0 }),
      expect.objectContaining({ text: "italic", format: 2 }),
      expect.objectContaining({ text: " word.", format: 0 }),
    ]);
  });

  it("turns a bullet list into a list", () => {
    const [list] = children("- one\n- two");
    expect(list).toMatchObject({ type: "list", listType: "bullet" });
    expect(list?.children).toHaveLength(2);
  });
});
