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
      ],
    }),
  ],
});
