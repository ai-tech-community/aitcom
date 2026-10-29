import type { Block } from "payload";
import {
  BlocksFeature,
  CodeBlock,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";

/**
 * The rich-text editor articles are written in: Lexical's defaults plus code,
 * image, and video blocks. Shared so magazine issue text (editor's note,
 * editorial items) is stored and rendered exactly like article content.
 */
export const ArticleImageBlock: Block = {
  slug: "Image",
  fields: [
    { name: "src", type: "text", required: true },
    { name: "alt", type: "text" },
  ],
};

/** A video URL. The reader turns YouTube and Vimeo into players and every other page into a link card. */
export const ArticleVideoBlock: Block = {
  slug: "Video",
  fields: [{ name: "url", type: "text" }],
};

const editorialPhotoFields = [
  { name: "src", type: "text" as const, required: true },
  { name: "alt", type: "text" as const, required: true },
  { name: "caption", type: "text" as const },
];

/** A displayed sentence, with an optional credit. */
export const ArticlePullQuoteBlock: Block = {
  slug: "PullQuote",
  fields: [
    { name: "quote", type: "textarea", required: true },
    { name: "attribution", type: "text" },
  ],
};

/** A photo with required alt text and an optional caption. */
export const ArticleCaptionedImageBlock: Block = {
  slug: "CaptionedImage",
  fields: editorialPhotoFields,
};

/** Two or more captioned photos. */
export const ArticleGalleryBlock: Block = {
  slug: "Gallery",
  fields: [
    {
      name: "images",
      type: "array",
      minRows: 2,
      maxRows: 8,
      fields: editorialPhotoFields,
    },
  ],
};

/** Two photos side by side. Alt text is required on both. */
export const ArticleSpreadBlock: Block = {
  slug: "Spread",
  fields: [
    { name: "leftSrc", type: "text", required: true },
    { name: "leftAlt", type: "text", required: true },
    { name: "leftCaption", type: "text" },
    { name: "rightSrc", type: "text", required: true },
    { name: "rightAlt", type: "text", required: true },
    { name: "rightCaption", type: "text" },
  ],
};

// Add bash to the language list (not in Monaco defaults, but Shiki supports it)
const codeLanguages = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain Text",
  python: "Python",
  shell: "Shell",
  sql: "SQL",
  typescript: "TypeScript",
  yaml: "YAML",
};

export const articleRichTextEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    BlocksFeature({
      blocks: [
        CodeBlock({ languages: codeLanguages }),
        ArticleImageBlock,
        ArticleVideoBlock,
        ArticlePullQuoteBlock,
        ArticleCaptionedImageBlock,
        ArticleGalleryBlock,
        ArticleSpreadBlock,
      ],
    }),
  ],
});
