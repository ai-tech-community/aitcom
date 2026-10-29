import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    loading,
  }: {
    src: string;
    alt: string;
    loading?: "lazy" | "eager";
  }) => (
    // The mock stands in for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading={loading} />
  ),
}));

import { articleBodyToLexical } from "@/server/magazines/agent-article-body";
import { renderLexicalDocument } from "@/lib/lexical-view";

it("renders editorial columns, a drop-cap body, a pull quote, and lazy photos", () => {
  const content = articleBodyToLexical(
    'A long opening sentence for the drop cap.\n\n:::pullquote\nCloth remembers.\n— Mira\n:::\n\n![Evening coat](https://cdn.example.test/coat.jpg "Wool, 1998")\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  const html = renderToStaticMarkup(
    renderLexicalDocument(content, { editorial: true }),
  );
  expect(html).toContain("editorial-body");
  expect(html).toContain("Cloth remembers.");
  expect(html).toContain("Mira");
  expect(html).toContain('alt="Evening coat"');
  expect(html).toContain("Wool, 1998");
  expect(html).toContain('loading="lazy"');
  expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  expect(html).toContain("editorial-span");
});
