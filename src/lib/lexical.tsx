import React from "react";

type LexicalNode = {
  type: string;
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  language?: string;
  src?: string;      // for image nodes
  alt?: string;      // for image nodes
  children?: LexicalNode[];
  fields?: { url?: string; newTab?: boolean; blockType?: string; code?: string; language?: string; src?: string; alt?: string };
};

type LexicalRoot = {
  root?: { children?: LexicalNode[] };
};

function extractPlainText(nodes: LexicalNode[]): string {
  return nodes
    .map((n) => {
      if (typeof n.text === "string") return n.text;
      if (n.children?.length) return extractPlainText(n.children);
      return "";
    })
    .join("");
}

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

    case "paragraph": {
      const plain = extractPlainText(node.children ?? []).trim();

      if (plain === "---") {
        return <hr key={idx} className="border-border my-6" />;
      }

      if (plain.startsWith("[!")) {
        const markerMatch = /^\[!([A-Z]+)\]\s*(.*)$/.exec(plain);
        const variant = markerMatch?.[1] ?? "NOTE";
        const title = markerMatch?.[2] ?? "";

        const styleMap: Record<string, string> = {
          INFO: "border-blue-500/40 bg-blue-500/10 text-blue-100",
          WARNING: "border-orange-500/40 bg-orange-500/10 text-orange-100",
          SUCCESS: "border-green-500/40 bg-green-500/10 text-green-100",
          NOTE: "border-zinc-500/40 bg-zinc-500/10 text-zinc-100",
        };

        return (
          <div key={idx} className={`my-4 rounded border px-4 py-3 ${styleMap[variant] ?? styleMap.NOTE}`}>
            <p className="font-mono text-xs tracking-wider">{variant}</p>
            {title ? <p className="mt-1 text-sm">{title}</p> : null}
          </div>
        );
      }

      if (plain.startsWith("[MERMAID]")) {
        const source = plain.replace("[MERMAID]", "").trim();
        return (
          <div key={idx} className="border-border bg-muted/30 my-4 rounded border p-4">
            <p className="text-muted-foreground mb-2 font-mono text-xs tracking-wider">MERMAID</p>
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
              <code>{source || "graph TD; A[Start] --> B[End]"}</code>
            </pre>
          </div>
        );
      }

      if (plain === "[TABS]") {
        return (
          <div key={idx} className="border-border bg-muted/20 my-4 rounded border px-3 py-2 font-mono text-xs">
            Tabs/Snippets Block
          </div>
        );
      }

      return (
        <p key={idx} className="mb-4 leading-relaxed">
          {node.children?.map((c, i) => renderNode(c, i))}
        </p>
      );
    }

    case "heading": {
      const Tag = (node.tag ?? "h2") as keyof React.JSX.IntrinsicElements;
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
      const listClass =
        node.listType === "number"
          ? "list-decimal"
          : node.listType === "check"
            ? "list-none"
            : "list-disc";
      return (
        <Tag key={idx} className={`mb-4 pl-6 ${listClass}`}>
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

    case "code": {
      // Legacy: standard Lexical CodeNode (type "code")
      const code = extractPlainText(node.children ?? []);
      return (
        <HighlightedCode key={idx} code={code} language={node.language} />
      );
    }

    case "block": {
      // Payload BlocksFeature CodeBlock
      if (node.fields?.blockType === "Code" && node.fields.code !== undefined) {
        return (
          <HighlightedCode key={idx} code={node.fields.code} language={node.fields.language} />
        );
      }
      // Payload BlocksFeature ImageBlock
      if (node.fields?.blockType === "Image" && node.fields.src) {
        const imgSrc = node.fields.src;
        const imgAlt = node.fields.alt ?? "";
        try {
          const parsed = new URL(imgSrc);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        } catch {
          return null;
        }
        return (
          <figure key={idx} className="my-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs */}
            <img src={imgSrc} alt={imgAlt} className="w-full rounded" />
            {imgAlt && <figcaption className="text-muted-foreground mt-2 text-center text-sm">{imgAlt}</figcaption>}
          </figure>
        );
      }
      return null;
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
          {node.children?.map((c, i) => renderNode(c, i))}
        </a>
      );
    }

    case "horizontalrule":
      return <hr key={idx} className="border-border my-6" />;

    case "image": {
      const src = node.src ?? "";
      const alt = node.alt ?? "";
      if (!src) return null;
      // Only render http/https URLs to prevent XSS via javascript: or data: URIs
      try {
        const parsed = new URL(src);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      } catch {
        return null;
      }
      return (
        <figure key={idx} className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs, next/image requires configured remotePatterns */}
          <img src={src} alt={alt} className="w-full rounded" />
          {alt && <figcaption className="text-muted-foreground mt-2 text-center text-sm">{alt}</figcaption>}
        </figure>
      );
    }

    default:
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

async function HighlightedCode({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const { codeToHtml } = await import("shiki");
  const lang = language ?? "plaintext";
  let html: string;
  try {
    html = await codeToHtml(code, {
      lang,
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      defaultColor: false,
    });
  } catch {
    // Fall back to unformatted if language not supported
    html = await codeToHtml(code, {
      lang: "plaintext",
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      defaultColor: false,
    });
  }
  return (
    <div
      className="[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-relaxed my-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Renders Payload Lexical rich text JSON as React elements.
 * Pass the raw `content` field value from a Payload document.
 */
export function LexicalRenderer({ content }: { content: unknown }) {
  let data = content as LexicalRoot;

  // Handle content stored/serialized as a JSON string
  if (typeof content === "string") {
    try {
      data = JSON.parse(content) as LexicalRoot;
    } catch {
      return null;
    }
  }

  if (!data?.root?.children) return null;

  return (
    <div className="text-foreground leading-7">
      {data.root.children.map((node, i) => renderNode(node, i))}
    </div>
  );
}
