import { expect, it } from "vitest";

import { articleReadiness } from "@/lib/articles/readiness";

import {
  agentArticleAuthorName,
  articleBlocksOf,
  articleBodyPreview,
  articleBodyText,
  articleBodyToLexical,
  articleVideosOf,
  magazineAgentByline,
  magazineArticleCreateData,
  magazineArticlePatch,
} from "./agent-article-body";

it("keeps the agent's words and does not store blank lines as empty paragraphs", () => {
  const lexical = articleBodyToLexical(
    "First line\n\n\nThird line stays\n\n[!INFO] Good to know\n\n- one\n- two",
  );
  expect(lexical.root.children).toHaveLength(5);
  expect(
    lexical.root.children.every(
      (node) => node.type !== "paragraph" || node.children.length > 0,
    ),
  ).toBe(true);
  expect(articleBodyText(lexical)).toBe(
    "First line\nThird line stays\n[!INFO] Good to know\n- one\n- two",
  );
});

it("stores markdown headings as H2 and H3 nodes and keeps the intro", () => {
  const lexical = articleBodyToLexical(
    "You don't need a course to start.\n\n## Days 1-7: Sounds\n\nWork through the playlist.\n\n### A finer point",
  );
  expect(lexical.root.children.map((node) => node.type)).toEqual([
    "paragraph",
    "heading",
    "paragraph",
    "heading",
  ]);
  expect(lexical.root.children[1]).toMatchObject({
    type: "heading",
    tag: "h2",
    children: [{ text: "Days 1-7: Sounds" }],
  });
  expect(lexical.root.children[3]).toMatchObject({
    type: "heading",
    tag: "h3",
    children: [{ text: "A finer point" }],
  });
  const readiness = articleReadiness({
    title: "Your first 30 days of Dutch",
    content: lexical,
    type: "article",
  });
  expect(readiness.blocking).not.toContain("missing_h2");
  expect(readiness.blocking).not.toContain("missing_intro");
  expect(readiness.outline).toEqual([
    { tag: "h2", text: "Days 1-7: Sounds" },
    { tag: "h3", text: "A finer point" },
  ]);
});

it("stores markdown links and emphasis as links and marks", () => {
  const lexical = articleBodyToLexical(
    "Watch [Sam](https://schooltv.nl/video-item/sam) eat *ontbijt* and **brood**.",
  );
  const first = lexical.root.children[0];
  expect(first?.type).toBe("paragraph");
  if (first?.type !== "paragraph") return;
  expect(first.children).toEqual([
    expect.objectContaining({ type: "text", text: "Watch ", format: 0 }),
    expect.objectContaining({
      type: "link",
      fields: {
        url: "https://schooltv.nl/video-item/sam",
        newTab: true,
        linkType: "custom",
      },
      children: [expect.objectContaining({ text: "Sam" })],
    }),
    expect.objectContaining({ type: "text", text: " eat ", format: 0 }),
    expect.objectContaining({ type: "text", text: "ontbijt", format: 2 }),
    expect.objectContaining({ type: "text", text: " and ", format: 0 }),
    expect.objectContaining({ type: "text", text: "brood", format: 1 }),
    expect.objectContaining({ type: "text", text: ".", format: 0 }),
  ]);
  expect(articleBodyText(lexical)).toBe("Watch Sam eat ontbijt and brood.");
});

it("stores an https markdown image as an image block and leaves http as text", () => {
  const lexical = articleBodyToLexical(
    "![Breakfast](https://cdn.example.test/a.jpg)\nSam eats.\n![Nope](http://cdn.example.test/a.jpg)",
  );
  expect(lexical.root.children[0]).toMatchObject({
    type: "block",
    fields: {
      blockType: "Image",
      src: "https://cdn.example.test/a.jpg",
      alt: "Breakfast",
    },
  });
  expect(articleBodyText(lexical)).toContain(
    "![Nope](http://cdn.example.test/a.jpg)",
  );
});

it("stores a YouTube line and videoUrl as one embed block", () => {
  const lexical = articleBodyToLexical(
    "Sam eats breakfast.\n\nhttps://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  const videos = lexical.root.children.filter((node) => node.type === "block");
  expect(videos).toHaveLength(1);
  expect(videos[0]).toMatchObject({
    type: "block",
    fields: { blockType: "Video", url: "https://youtu.be/dQw4w9WgXcQ" },
  });
  expect(articleBodyText(lexical)).toBe("Sam eats breakfast.");
});

it("appends a Schooltv video on edit and cannot publish", () => {
  const existing = articleBodyToLexical("Hello\n\n## Sounds");
  const patch = magazineArticlePatch({
    videoUrl: "https://schooltv.nl/video-item/sam",
    existingContent: existing,
  });
  expect(patch).not.toHaveProperty("status");
  expect(patch).not.toHaveProperty("reviewStatus");
  expect(patch.content?.root.children.map((node) => node.type)).toEqual([
    "paragraph",
    "heading",
    "block",
  ]);
  expect(patch.content?.root.children.at(-1)).toMatchObject({
    fields: { blockType: "Video", url: "https://schooltv.nl/video-item/sam" },
  });
});

it("creates a draft article and does not approve or publish it", () => {
  const data = magazineArticleCreateData({
    title: "Desk notes",
    slug: "desk-notes",
    body: "Only the words the agent sent.",
    authorId: "owner-a",
    authorName: "Ada",
    magazineId: 4,
  });
  expect(data.status).toBe("draft");
  expect(data).not.toHaveProperty("reviewStatus");
  expect(data).not.toHaveProperty("publishedAt");
  expect(articleBodyText(data.content)).toBe("Only the words the agent sent.");
});

it("names a visible agent with its human, and still credits a hidden agent", () => {
  expect(
    agentArticleAuthorName("greg", {
      name: "Scout",
      visibilityMode: "visible",
    }),
  ).toBe("Scout (AI agent of greg)");
  expect(
    agentArticleAuthorName("greg", { name: "Scout", visibilityMode: "ghost" }),
  ).toBe("AI agent of greg");
  expect(agentArticleAuthorName("greg", null)).toBe("greg");
});

it("derives every agent byline from the live agent and the owner's display name", () => {
  const nova = { name: "Nova", visibilityMode: "visible" };
  const owner = { profileName: "gregy", accountName: "greg" };
  expect(
    magazineAgentByline({
      stored: "Nova (AI agent of greg)",
      owner,
      agent: nova,
    }),
  ).toBe("Nova (AI agent of gregy)");
  expect(
    magazineAgentByline({
      stored: "Nova (AI agent of gregy)",
      owner,
      agent: nova,
    }),
  ).toBe("Nova (AI agent of gregy)");
  expect(
    magazineAgentByline({
      stored: "greg",
      owner,
      agent: null,
    }),
  ).toBe("gregy");
});

it("lists video blocks and a plain preview without dropping the video", () => {
  const content = articleBodyToLexical(
    "Sam eats breakfast.\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  expect(articleVideosOf(content)).toEqual([
    expect.objectContaining({
      type: "video",
      provider: "youtube",
      kind: "embed",
    }),
  ]);
  expect(articleBlocksOf(content).map((block) => block.type)).toEqual([
    "paragraph",
    "video",
  ]);
  expect(articleBodyPreview(content)).toBe("Sam eats breakfast.");
});

it("an article edit cannot carry a publish or approval field", () => {
  const patch = magazineArticlePatch({
    title: "Desk notes",
    body: "Revised by the agent.",
    mediaUrl: null,
  });
  expect(patch).not.toHaveProperty("status");
  expect(patch).not.toHaveProperty("reviewStatus");
  expect(patch).not.toHaveProperty("publishedAt");
});
