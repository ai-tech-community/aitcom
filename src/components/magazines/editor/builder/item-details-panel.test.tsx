import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/trpc/react", () => ({ api: {} }));

import { renderWithIntl } from "../../test-intl";

vi.mock("@/components/article-editor/rich-text-editor", () => ({
  RichTextEditor: () => <textarea aria-label="Text" />,
}));

import type { BuilderItem } from "./items-model";
import { ItemDetailsPanel } from "./item-details-panel";
import { newItemImage } from "@/lib/magazines/item-image";

const article: BuilderItem = { kind: "article", key: "a", articleId: 7 };
const editorial: BuilderItem = {
  kind: "editorial",
  key: "e",
  heading: "From the editor",
  body: null,
};

/** Applies each patch, so a controlled intro can be typed and then cleared. */
function IntroHost({
  onChange,
}: {
  onChange: (patch: Partial<BuilderItem>) => void;
}) {
  const [item, setItem] = useState(article);
  return (
    <ItemDetailsPanel
      item={item}
      kindLabel="Article"
      onChange={(patch) => {
        onChange(patch);
        setItem((current) =>
          current.kind === "article"
            ? { ...current, intro: patch.intro }
            : current,
        );
      }}
      onDone={vi.fn()}
    />
  );
}

describe("ItemDetailsPanel", () => {
  it("adds an issue image from the linked article without editing its intro", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <ItemDetailsPanel
        item={article}
        kindLabel="Article"
        sourceImageUrl="https://example.test/source.jpg"
        onChange={onChange}
        onDone={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use article image" }));
    expect(onChange).toHaveBeenCalledWith({
      image: newItemImage("https://example.test/source.jpg"),
    });
  });
  it("edits the intro line of any item", () => {
    const onChange = vi.fn();
    renderWithIntl(<IntroHost onChange={onChange} />);
    const intro = screen.getByRole("textbox", {
      name: "Intro line (optional)",
    });
    expect(intro).toHaveAttribute("maxLength", "280");

    fireEvent.change(intro, { target: { value: "Our take" } });
    expect(onChange).toHaveBeenCalledWith({ intro: "Our take" });

    fireEvent.change(intro, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ intro: undefined });
  });

  it("shows the kind's own editor under the intro", () => {
    const { unmount } = renderWithIntl(
      <ItemDetailsPanel
        item={editorial}
        kindLabel="Text section"
        onChange={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    const intro = screen.getByRole("textbox", {
      name: "Intro line (optional)",
    });
    const heading = screen.getByRole("textbox", { name: "Heading (optional)" });
    expect(
      intro.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    unmount();

    renderWithIntl(
      <ItemDetailsPanel
        item={article}
        kindLabel="Article"
        onChange={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("textbox", { name: "Heading (optional)" }),
    ).toBeNull();
  });
});
