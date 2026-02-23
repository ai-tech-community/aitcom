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

    case "paragraph":
      return (
        <p key={idx} className="mb-4 leading-relaxed">
          {node.children?.map((c, i) => renderNode(c, i))}
        </p>
      );

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
      const code = extractPlainText(node.children ?? []);
      return (
        <HighlightedCode key={idx} code={code} language={node.language} />
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
          {node.children?.map((c, i) => renderNode(c, i))}
        </a>
      );
    }

    case "horizontalrule":
      return <hr key={idx} className="border-border my-6" />;

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
  const data = content as LexicalRoot;
  if (!data?.root?.children) return null;

  return (
    <div className="text-foreground leading-7">
      {data.root.children.map((node, i) => renderNode(node, i))}
    </div>
  );
}
