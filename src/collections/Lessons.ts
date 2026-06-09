import type { Block, CollectionConfig } from "payload";
import {
  BlocksFeature,
  CodeBlock,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";

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

const ImageBlock: Block = {
  slug: "Image",
  fields: [
    { name: "src", type: "text", required: true },
    { name: "alt", type: "text" },
  ],
};

export const Lessons: CollectionConfig = {
  slug: "lessons",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "course", "order"],
    description: "Lessons within a course.",
  },
  fields: [
    {
      name: "course",
      type: "number",
      required: true,
      index: true,
      admin: { description: "courses.id" },
    },
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "order", type: "number", defaultValue: 0, index: true },
    { name: "youtubeUrl", type: "text", maxLength: 500 },
    {
      name: "body",
      type: "richText",
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({
            blocks: [CodeBlock({ languages: codeLanguages }), ImageBlock],
          }),
        ],
      }),
    },
    { name: "examMandatory", type: "checkbox", defaultValue: false },
    {
      name: "examPassThreshold",
      type: "number",
      defaultValue: 70,
      min: 0,
      max: 100,
      admin: { description: "Percent (0–100) required to pass." },
    },
    {
      name: "examMaxAttempts",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: { description: "0 = unlimited attempts." },
    },
    {
      name: "examQuestions",
      type: "json",
      admin: {
        description:
          "Array of { id, prompt, type, options[], correctIndex }. Authored via the custom lesson editor.",
      },
    },
    {
      name: "resources",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "url", type: "text", required: true },
      ],
    },
  ],
  timestamps: true,
};
