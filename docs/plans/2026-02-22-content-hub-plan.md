# Content Hub (Blog) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the blog/content hub frontend: article listing page and article detail page with proper rich text rendering, using the existing Payload CMS Articles collection.

**Architecture:** Two Next.js Server Component pages (`/[locale]/blog` and `/[locale]/blog/[slug]`) fetch content from Payload CMS via the local API (`getPayloadClient()`). A shared Lexical-to-JSX renderer handles the rich text content field. No new database tables, no new tRPC routes — content is fully managed through the Payload Admin UI at `/admin`.

**Tech Stack:** Next.js 15 App Router, Payload CMS (local API), next-intl, Tailwind CSS, TypeScript

---

## Context

- Articles are already defined in Payload: `src/collections/Articles.ts`
- Fields: `title` (localized), `slug`, `content` (richText, localized), `type` (article|tutorial|talk_recording), `tags` (json), `mediaUrl`, `status` (draft|published), `publishedAt`
- Payload local API pattern: `import { getPayloadClient } from "@/server/payload"` → `payload.find({ collection: "articles", ... })`
- Reference pattern: `src/app/[locale]/events/page.tsx` and `src/app/[locale]/events/[slug]/page.tsx`
- Navbar already has `/blog` link with `[B]` shortcut — no navbar changes needed
- `nav.blog` i18n key already exists — only need to add `blog.*` content keys

---

## Task 1: Add blog i18n translations

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add `blog` namespace to `messages/en.json`**

Add after the `"events"` object:

```json
"blog": {
  "title": "Blog",
  "subtitle": "Articles, tutorials, and talk recordings from the community.",
  "noArticles": "No articles published yet. Check back soon!",
  "readMore": "Read more",
  "publishedAt": "Published",
  "tags": "Tags",
  "article": "Article",
  "tutorial": "Tutorial",
  "talkRecording": "Talk Recording",
  "backToBlog": "← Back to blog"
},
```

**Step 2: Add `blog` namespace to `messages/nl.json`**

Add after the `"events"` object:

```json
"blog": {
  "title": "Blog",
  "subtitle": "Artikelen, tutorials en opnames van lezingen vanuit de community.",
  "noArticles": "Nog geen artikelen gepubliceerd. Kom later terug!",
  "readMore": "Lees meer",
  "publishedAt": "Gepubliceerd",
  "tags": "Tags",
  "article": "Artikel",
  "tutorial": "Tutorial",
  "talkRecording": "Lezing Opname",
  "backToBlog": "← Terug naar blog"
},
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat: add blog i18n translations"
```

---

## Task 2: Lexical rich text renderer

**Files:**
- Create: `src/lib/lexical.tsx`

The Payload Lexical editor stores content as JSON. This task creates a server-side JSX renderer that converts Lexical nodes to HTML elements with Tailwind prose styling. The events page uses `extractTextFromRichText()` which only extracts plain text — articles need proper formatted rendering.

**Lexical JSON structure:**
```json
{
  "root": {
    "children": [
      { "type": "paragraph", "children": [{ "type": "text", "text": "Hello", "format": 1 }] },
      { "type": "heading", "tag": "h2", "children": [...] },
      { "type": "list", "listType": "bullet", "children": [...] }
    ]
  }
}
```

Text `format` is a bitmask: `1`=bold, `2`=italic, `4`=strikethrough, `8`=underline, `16`=code.

**Step 1: Create `src/lib/lexical.tsx`**

```tsx
import React from "react";

type LexicalNode = {
  type: string;
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  language?: string;
  children?: LexicalNode[];
  fields?: { url?: string; newTab?: boolean };
};

type LexicalRoot = {
  root?: { children?: LexicalNode[] };
};

function renderText(node: LexicalNode): React.ReactNode {
  const fmt = node.format ?? 0;
  let el: React.ReactNode = node.text ?? "";
  if (fmt & 16) el = <code className="bg-muted rounded px-1 py-0.5 font-mono text-sm">{el}</code>;
  if (fmt & 1) el = <strong>{el}</strong>;
  if (fmt & 2) el = <em>{el}</em>;
  if (fmt & 4) el = <s>{el}</s>;
  if (fmt & 8) el = <u>{el}</u>;
  return el;
}

function renderNode(node: LexicalNode, idx: number): React.ReactNode {
  switch (node.type) {
    case "text":
      return <React.Fragment key={idx}>{renderText(node)}</React.Fragment>;

    case "linebreak":
      return <br key={idx} />;

    case "paragraph":
      return (
        <p key={idx} className="mb-4 leading-relaxed">
          {node.children?.map((c, i) => renderNode(c, i))}
        </p>
      );

    case "heading": {
      const Tag = (node.tag ?? "h2") as keyof JSX.IntrinsicElements;
      const headingClass: Record<string, string> = {
        h1: "mt-8 mb-4 text-3xl font-bold tracking-tight",
        h2: "mt-8 mb-3 text-2xl font-bold tracking-tight",
        h3: "mt-6 mb-2 text-xl font-semibold",
        h4: "mt-4 mb-2 text-lg font-semibold",
        h5: "mt-4 mb-2 font-semibold",
        h6: "mt-4 mb-2 font-medium text-muted-foreground",
      };
      return (
        <Tag key={idx} className={headingClass[node.tag ?? "h2"]}>
          {node.children?.map((c, i) => renderNode(c, i))}
        </Tag>
      );
    }

    case "list": {
      const Tag = node.listType === "number" ? "ol" : "ul";
      return (
        <Tag
          key={idx}
          className={`mb-4 pl-6 ${node.listType === "number" ? "list-decimal" : "list-disc"}`}
        >
          {node.children?.map((c, i) => renderNode(c, i))}
        </Tag>
      );
    }

    case "listitem":
      return (
        <li key={idx} className="mb-1">
          {node.children?.map((c, i) => renderNode(c, i))}
        </li>
      );

    case "quote":
      return (
        <blockquote
          key={idx}
          className="border-primary/40 text-muted-foreground my-4 border-l-4 pl-4 italic"
        >
          {node.children?.map((c, i) => renderNode(c, i))}
        </blockquote>
      );

    case "code":
      return (
        <pre
          key={idx}
          className="bg-muted overflow-x-auto rounded p-4 font-mono text-sm"
        >
          <code>{node.children?.map((c, i) => renderNode(c, i))}</code>
        </pre>
      );

    case "link": {
      const href = node.fields?.url ?? node.url ?? "#";
      const newTab = node.fields?.newTab ?? false;
      return (
        <a
          key={idx}
          href={href}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          {node.children?.map((c, i) => renderNode(c, i))}
        </a>
      );
    }

    case "horizontalrule":
      return <hr key={idx} className="border-border my-6" />;

    default:
      // Unknown node: try to render children or nothing
      if (node.children?.length) {
        return (
          <React.Fragment key={idx}>
            {node.children.map((c, i) => renderNode(c, i))}
          </React.Fragment>
        );
      }
      return null;
  }
}

/**
 * Renders Payload Lexical rich text JSON as React elements.
 * Pass the raw `content` field value from a Payload document.
 */
export function LexicalRenderer({ content }: { content: unknown }) {
  const data = content as LexicalRoot;
  if (!data?.root?.children) return null;

  return (
    <div className="text-foreground leading-7">
      {data.root.children.map((node, i) => renderNode(node, i))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/lib/lexical.tsx
git commit -m "feat: add Lexical rich text renderer for article content"
```

---

## Task 3: Blog listing page

**Files:**
- Create: `src/app/[locale]/blog/page.tsx`

Follow the same Server Component pattern as `src/app/[locale]/events/page.tsx`.

**Step 1: Create `src/app/[locale]/blog/page.tsx`**

```tsx
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";

const typeLabels: Record<string, string> = {
  article: "ARTICLE",
  tutorial: "TUTORIAL",
  talk_recording: "TALK",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BlogPage() {
  const locale = await getLocale();
  const t = await getTranslations("blog");

  const payload = await getPayloadClient();
  const { docs: articles } = await payload.find({
    collection: "articles",
    where: { status: { equals: "published" } },
    sort: "-publishedAt",
    locale: locale as "en" | "nl",
  });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>

      {articles.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">{t("noArticles")}</p>
      ) : (
        <>
          {/* Table Header */}
          <div className="border-border flex items-center border-b px-4 py-2.5">
            <span className="text-muted-foreground w-32 font-mono text-[11px] font-medium tracking-wider">
              / DATE
            </span>
            <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
              / TITLE
            </span>
            <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
              / TYPE
            </span>
          </div>

          {/* Article Rows */}
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/blog/${article.slug}`}
              className="border-border hover:bg-secondary/50 flex items-center border-b px-4 py-3.5 transition-colors"
            >
              <div className="flex w-32 items-center gap-3">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-[13px]">
                  {article.publishedAt ? formatDate(article.publishedAt) : "—"}
                </span>
              </div>
              <span className="flex-1 font-medium">{article.title}</span>
              <span className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider">
                {typeLabels[article.type] ?? article.type}
              </span>
              <span className="text-muted-foreground ml-4 font-mono text-lg font-light">+</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/blog/page.tsx
git commit -m "feat: add blog listing page"
```

---

## Task 4: Article detail page

**Files:**
- Create: `src/app/[locale]/blog/[slug]/page.tsx`

Follow `src/app/[locale]/events/[slug]/page.tsx` but render the rich text `content` field using `LexicalRenderer`. Add `generateMetadata` for SEO.

**Step 1: Create `src/app/[locale]/blog/[slug]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";

const typeLabels: Record<string, string> = {
  article: "ARTICLE",
  tutorial: "TUTORIAL",
  talk_recording: "TALK RECORDING",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    locale: locale as "en" | "nl",
    limit: 1,
  });
  const article = docs[0];
  if (!article) return {};
  return { title: article.title };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("blog");

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    locale: locale as "en" | "nl",
    limit: 1,
  });

  const article = docs[0];
  if (!article) notFound();

  const tags = Array.isArray(article.tags) ? (article.tags as string[]) : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      {/* Back link */}
      <Link
        href="/blog"
        className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
      >
        {t("backToBlog")}
      </Link>

      {/* Meta line */}
      <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-3 font-mono text-xs tracking-wider">
        {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
        <span className="text-border">|</span>
        <span className="border-border rounded border px-2.5 py-0.5 font-medium">
          {typeLabels[article.type] ?? article.type}
        </span>
      </div>

      {/* Title */}
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">{article.title}</h1>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="border-border mt-8 border-t pt-8">
        <LexicalRenderer content={article.content} />
      </div>
    </div>
  );
}
```

**Step 2: Verify the page compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/app/[locale]/blog/[slug]/page.tsx
git commit -m "feat: add article detail page with Lexical rich text rendering"
```

---

## Task 5: Verify with a test article

**Step 1: Create a test article in Payload Admin**

1. Open `http://localhost:3000/admin`
2. Go to Articles → Create New
3. Fill in:
   - Title: "Hello World" (both EN and NL)
   - Slug: `hello-world`
   - Content: Write a few paragraphs with headings, bold text, a bullet list
   - Type: `article`
   - Status: `published`
   - Published At: today's date
4. Save

**Step 2: Check the listing page**

Open `http://localhost:3000/en/blog`

Expected:
- Article appears in the list with date, title, and `ARTICLE` type badge

**Step 3: Check the detail page**

Open `http://localhost:3000/en/blog/hello-world`

Expected:
- Title, date, type badge render correctly
- Rich text content renders with proper headings, paragraphs, list styling
- Back link works

**Step 4: Check Dutch locale**

Open `http://localhost:3000/nl/blog/hello-world`

Expected: Dutch translated title/content if you added NL translations in the article.

**Step 5: Commit (if any tweaks were made)**

```bash
git add -p
git commit -m "fix: polish blog pages after manual verification"
```
