import React from "react";
import { slugify } from "@/lib/text-utils";

import { VideoFrame } from "@/components/article-editor/nodes/video-frame";
import { renderEditorialBlock } from "@/components/magazines/reading/editorial-figures";
import {
  hasInlineMarkdown,
  parseInlineMarkdown,
} from "@/lib/articles/inline-markdown";
import {
  markdownImagesOnly,
  splitMarkdownImages,
} from "@/lib/articles/markdown-image";

import { extractPlainText } from "./lexical-text";
import {
  admonitionBorderClass,
  splitAdmonition,
  stripStrayEmptyParagraphs,
  type LexicalLikeNode,
} from "./lexical-blocks";

type LexicalNode = LexicalLikeNode & {
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  language?: string;
  src?: string;
  alt?: string;
  children?: LexicalNode[];
  fields?: {
    url?: string;
    newTab?: boolean;
    blockType?: string;
    code?: string;
    language?: string;
    src?: string;
    alt?: string;
    [key: string]: unknown;
  };
};

type LexicalRoot = {
  root?: { children?: LexicalNode[] };
};

function applyFormat(text: string, fmt: number): React.ReactNode {
  let el: React.ReactNode = text;
  if (fmt & 16)
    el = (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-sm">
        {el}
      </code>
    );
  if (fmt & 1) el = <strong>{el}</strong>;
  if (fmt & 2) el = <em>{el}</em>;
  if (fmt & 4) el = <s>{el}</s>;
  if (fmt & 8) el = <u>{el}</u>;
  return el;
}

/**
 * Stored agent markdown (`[text](url)`, `*italic*`) renders as a link or
 * mark. The document is not rewritten.
 */
/** The image block and markdown `![alt](url)` share this picture. */
function renderArticleImage(src: string, alt: string, key: number) {
  return (
    <figure key={key} className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded"
      />
      {alt ? (
        <figcaption className="text-muted-foreground mt-2 text-center text-sm">
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
}

function renderInlinePiece(text: string, fmt: number): React.ReactNode {
  if ((fmt & 16) === 0 && text && hasInlineMarkdown(text)) {
    return parseInlineMarkdown(text).map((piece, index) => {
      if (piece.kind === "link") {
        return (
          <a
            key={index}
            href={piece.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:opacity-80"
          >
            {applyFormat(piece.text, fmt)}
          </a>
        );
      }
      return (
        <React.Fragment key={index}>
          {applyFormat(piece.text, fmt | piece.format)}
        </React.Fragment>
      );
    });
  }
  return applyFormat(text, fmt);
}

function renderText(node: LexicalNode): React.ReactNode {
  const fmt = node.format ?? 0;
  const raw = node.text ?? "";
  const segments = (fmt & 16) === 0 ? splitMarkdownImages(raw) : null;
  if (segments?.some((segment) => segment.kind === "image")) {
    return segments.map((segment, index) => {
      if (segment.kind === "image") {
        return (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs
          <img
            key={index}
            src={segment.url}
            alt={segment.alt}
            loading="lazy"
            decoding="async"
            className="my-2 h-auto max-w-full rounded"
          />
        );
      }
      return (
        <React.Fragment key={index}>
          {renderInlinePiece(segment.text, fmt)}
        </React.Fragment>
      );
    });
  }
  return renderInlinePiece(raw, fmt);
}

/** Renderers for Payload blocks this renderer doesn't know (keyed by blockType). */
export type BlockRenderers = Record<
  string,
  (fields: Record<string, unknown>) => React.ReactNode
>;

type RenderContext = {
  slugMap: Map<string, number>;
  blockRenderers?: BlockRenderers;
  renderCode?: (code: string, language: string | undefined) => React.ReactNode;
  editorial: boolean;
};

function renderAdmonition(
  idx: number,
  variant: string,
  body: React.ReactNode,
): React.ReactNode {
  return (
    <aside
      key={idx}
      role="note"
      data-admonition={variant}
      className={`text-foreground my-4 rounded border px-4 py-3 ${admonitionBorderClass(variant)}`}
    >
      <p className="font-mono text-xs tracking-wider">{variant}</p>
      {body ? <div className="mt-1 text-sm leading-relaxed">{body}</div> : null}
    </aside>
  );
}

function isHttpUrl(src: string): boolean {
  try {
    const parsed = new URL(src);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function renderNode(
  node: LexicalNode,
  idx: number,
  ctx: RenderContext,
): React.ReactNode {
  switch (node.type) {
    case "text":
      return <React.Fragment key={idx}>{renderText(node)}</React.Fragment>;

    case "linebreak":
      return <br key={idx} />;

    case "paragraph": {
      const plain = extractPlainText(node.children ?? []).trim();

      if (plain === "---") {
        return <hr key={idx} className="border-border my-6" />;
      }

      const admonition = splitAdmonition(node.children ?? []);
      if (admonition && plain.startsWith("[!")) {
        return renderAdmonition(
          idx,
          admonition.variant,
          admonition.body.map((child, i) =>
            renderNode(child as LexicalNode, i, ctx),
          ),
        );
      }

      if (plain.startsWith("[MERMAID]")) {
        const source = plain.replace("[MERMAID]", "").trim();
        return (
          <div
            key={idx}
            className="border-border bg-muted/30 my-4 rounded border p-4"
          >
            <p className="text-muted-foreground mb-2 font-mono text-xs tracking-wider">
              MERMAID
            </p>
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
              <code>{source || "graph TD; A[Start] --> B[End]"}</code>
            </pre>
          </div>
        );
      }

      if (plain === "[TABS]") {
        return (
          <div
            key={idx}
            className="border-border bg-muted/20 my-4 rounded border px-3 py-2 font-mono text-xs"
          >
            Tabs/Snippets Block
          </div>
        );
      }

      const onlyImages = markdownImagesOnly(plain);
      if (
        onlyImages &&
        (node.children ?? []).every((child) => child.type === "text")
      ) {
        return (
          <React.Fragment key={idx}>
            {onlyImages.map((image, imageIndex) =>
              image.kind === "image"
                ? renderArticleImage(image.url, image.alt, imageIndex)
                : null,
            )}
          </React.Fragment>
        );
      }

      return (
        <p key={idx} className="mb-4 leading-relaxed">
          {node.children?.map((c, i) => renderNode(c, i, ctx))}
        </p>
      );
    }

    case "heading": {
      const Tag = (node.tag ?? "h2") as "h2" | "h3" | "h4" | "h5" | "h6";
      const headingClass: Record<string, string> = {
        h1: "mt-8 mb-4 text-3xl font-semibold tracking-tight",
        h2: "mt-8 mb-3 text-2xl font-semibold tracking-tight",
        h3: "mt-6 mb-2 text-xl font-semibold",
        h4: "mt-4 mb-2 text-lg font-semibold",
        h5: "mt-4 mb-2 font-semibold",
        h6: "mt-4 mb-2 text-muted-foreground font-medium",
      };
      const text = extractPlainText(node.children ?? []);
      const baseSlug = slugify(text);
      const count = ctx.slugMap.get(baseSlug) ?? 0;
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      ctx.slugMap.set(baseSlug, count + 1);

      return (
        <Tag
          key={idx}
          id={slug}
          className={`group ${headingClass[node.tag ?? "h2"]}`}
        >
          {node.children?.map((c, i) => renderNode(c, i, ctx))}
          <a
            href={`#${slug}`}
            aria-label="Link to this section"
            className="text-muted-foreground ml-2 opacity-0 transition-opacity group-hover:opacity-100"
          >
            #
          </a>
        </Tag>
      );
    }

    case "list": {
      const Tag = node.listType === "number" ? "ol" : "ul";
      const listClass =
        node.listType === "number"
          ? "list-decimal"
          : node.listType === "check"
            ? "list-none"
            : "list-disc";
      return (
        <Tag key={idx} className={`mb-4 pl-6 ${listClass}`}>
          {node.children?.map((c, i) => renderNode(c, i, ctx))}
        </Tag>
      );
    }

    case "listitem":
      return (
        <li key={idx} className="mb-1">
          {node.children?.map((c, i) => renderNode(c, i, ctx))}
        </li>
      );

    case "quote":
      return (
        <blockquote
          key={idx}
          className="border-primary/40 text-muted-foreground my-4 border-l-4 pl-4 italic"
        >
          {node.children?.map((c, i) => renderNode(c, i, ctx))}
        </blockquote>
      );

    case "code": {
      const code = extractPlainText(node.children ?? []);
      if (ctx.renderCode) {
        return (
          <React.Fragment key={idx}>
            {ctx.renderCode(code, node.language)}
          </React.Fragment>
        );
      }
      return (
        <pre
          key={idx}
          className="my-4 overflow-x-auto rounded p-4 font-mono text-sm leading-relaxed"
        >
          <code>{code}</code>
        </pre>
      );
    }

    case "block": {
      if (node.fields?.blockType === "Code" && node.fields.code !== undefined) {
        const code = node.fields.code;
        if (ctx.renderCode) {
          return (
            <React.Fragment key={idx}>
              {ctx.renderCode(code, node.fields.language)}
            </React.Fragment>
          );
        }
        return (
          <pre
            key={idx}
            className="my-4 overflow-x-auto rounded p-4 font-mono text-sm leading-relaxed"
          >
            <code>{code}</code>
          </pre>
        );
      }
      if (
        node.fields?.blockType === "Video" &&
        typeof node.fields.url === "string"
      ) {
        const videoUrl = node.fields.url;
        if (!videoUrl.trim()) return null;
        return (
          <VideoFrame
            key={idx}
            url={videoUrl}
            presentation={ctx.editorial ? "editorial" : "plain"}
          />
        );
      }
      if (node.fields) {
        const editorial = renderEditorialBlock(
          node.fields as Record<string, unknown>,
        );
        if (editorial) {
          return <React.Fragment key={idx}>{editorial}</React.Fragment>;
        }
      }
      if (node.fields?.blockType === "Image" && node.fields.src) {
        const imgSrc = node.fields.src;
        const imgAlt = node.fields.alt ?? "";
        if (!isHttpUrl(imgSrc)) return null;
        return renderArticleImage(imgSrc, imgAlt, idx);
      }
      const blockType = node.fields?.blockType;
      const custom = blockType ? ctx.blockRenderers?.[blockType] : undefined;
      if (!custom || !node.fields) return null;
      return (
        <React.Fragment key={idx}>
          {custom(node.fields as Record<string, unknown>)}
        </React.Fragment>
      );
    }

    case "autolink":
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
          {node.children?.map((c, i) => renderNode(c, i, ctx))}
        </a>
      );
    }

    case "admonition": {
      const variant = typeof node.variant === "string" ? node.variant : "INFO";
      const inner = (node.children ?? []).flatMap(
        (child) => child.children ?? [child],
      );
      return renderAdmonition(
        idx,
        variant,
        inner.map((child, i) => renderNode(child as LexicalNode, i, ctx)),
      );
    }

    case "horizontalrule":
      return <hr key={idx} className="border-border my-6" />;

    case "image": {
      const src = node.src ?? "";
      const alt = node.alt ?? "";
      if (!src || !isHttpUrl(src)) return null;
      return renderArticleImage(src, alt, idx);
    }

    default:
      if (node.children?.length) {
        return (
          <React.Fragment key={idx}>
            {node.children.map((c, i) => renderNode(c, i, ctx))}
          </React.Fragment>
        );
      }
      return null;
  }
}

export type LexicalViewOptions = {
  blockRenderers?: BlockRenderers;
  /**
   * Server pages pass the highlighted-code component. The editor preview
   * leaves this out and gets a plain `<pre>`.
   */
  renderCode?: (code: string, language: string | undefined) => React.ReactNode;
  /** Magazine article: serif columns, drop cap, and editorial figures. */
  editorial?: boolean;
};

/**
 * Payload Lexical JSON as React. Empty paragraphs that only pad a block are
 * omitted, including ones saved before the editor stopped creating them.
 */
export function renderLexicalDocument(
  content: unknown,
  options: LexicalViewOptions = {},
): React.ReactNode {
  let data = content as LexicalRoot;

  if (typeof content === "string") {
    try {
      data = JSON.parse(content) as LexicalRoot;
    } catch {
      return null;
    }
  }

  if (!data?.root?.children) return null;

  const children = stripStrayEmptyParagraphs(data.root.children);
  const ctx: RenderContext = {
    slugMap: new Map<string, number>(),
    blockRenderers: options.blockRenderers,
    renderCode: options.renderCode,
    editorial: options.editorial === true,
  };
  return (
    <div
      className={
        options.editorial
          ? "editorial-body font-magazine-serif text-foreground text-[1.0625rem] leading-8"
          : "text-foreground leading-7"
      }
    >
      {children.map((node, i) => renderNode(node, i, ctx))}
    </div>
  );
}
