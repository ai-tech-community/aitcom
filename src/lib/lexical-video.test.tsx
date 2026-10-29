import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderLexicalDocument } from "./lexical-view";

const YT = "dQw4w9WgXcQ";

const article = {
  root: {
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            text: "Watch [Sam](https://schooltv.nl/video-item/sam) eat *ontbijt*.",
          },
        ],
      },
      {
        type: "block",
        fields: {
          blockType: "Video",
          url: `https://www.youtube.com/watch?v=${YT}`,
        },
      },
      {
        type: "block",
        fields: {
          blockType: "Video",
          url: "https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck",
        },
      },
      {
        type: "block",
        fields: {
          blockType: "Video",
          url: "https://evil.test/player",
        },
      },
    ],
  },
};

describe("article video and markdown on the server", () => {
  it("renders an allowlisted player, link cards, and markdown without rewriting the document", () => {
    const before = JSON.stringify(article);
    const html = renderToStaticMarkup(renderLexicalDocument(article));
    expect(JSON.stringify(article)).toBe(before);

    expect(html).toContain(`https://www.youtube-nocookie.com/embed/${YT}`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain(
      'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"',
    );
    expect(html).toContain("aspect-video");
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).not.toContain("youtube.com/embed");
    expect(html).not.toMatch(/<iframe[^>]*evil\.test/);
    expect(html).toContain('href="https://evil.test/player"');
    expect(html).toContain(
      "https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck",
    );
    expect(html).toContain('data-video="card"');
    expect(html).toContain('href="https://schooltv.nl/video-item/sam"');
    expect(html).toContain("<em>ontbijt</em>");
    expect(html).not.toContain("*ontbijt*");
    expect(html).not.toContain("[Sam]");
  });
});
