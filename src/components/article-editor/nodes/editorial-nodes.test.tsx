import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createEditor, $getRoot } from "@payloadcms/richtext-lexical/lexical";
import { describe, expect, it } from "vitest";
import fr from "../../../../messages/fr.json";
import { GalleryNode } from "./editorial-nodes";

function gallery(size: number) {
  const editor = createEditor({
    nodes: [GalleryNode],
    onError: (error) => {
      throw error;
    },
  });
  let node!: GalleryNode;
  editor.update(
    () => {
      node = new GalleryNode(
        Array.from({ length: size }, (_, index) => ({
          src: `https://example.org/${index}.jpg`,
          alt: `Photo ${index + 1}`,
          caption: "",
        })),
      );
      $getRoot().append(node);
    },
    { discrete: true },
  );
  render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      {node.decorate(editor)}
    </NextIntlClientProvider>,
  );
}

describe("editorial gallery", () => {
  it("stops at the eight-photo storage limit and lets an editor remove a photo", () => {
    gallery(8);
    const add = screen.getByRole("button", { name: "Ajouter une photo" });
    expect(add).toBeDisabled();
    expect(
      screen.getAllByRole("textbox", { name: /URL de l’image/ }),
    ).toHaveLength(8);
    fireEvent.click(
      screen.getByRole("button", { name: "Supprimer la photo 8" }),
    );
    expect(add).toBeEnabled();
    expect(
      screen.getAllByRole("textbox", { name: /URL de l’image/ }),
    ).toHaveLength(7);
    fireEvent.click(add);
    expect(add).toBeDisabled();
  });

  it("preserves the required two-photo minimum", () => {
    gallery(2);
    expect(
      screen.getByRole("button", { name: "Supprimer la photo 1" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Supprimer la photo 2" }),
    ).toBeDisabled();
  });
});
