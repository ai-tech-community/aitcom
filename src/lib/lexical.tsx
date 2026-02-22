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
      const tag = (node.tag ?? "h2") as React.ElementType;
      const headingClass: Record<string, string> = {
        h1: "mt-8 mb-4 text-3xl font-bold tracking-tight",
        h2: "mt-8 mb-3 text-2xl font-bold tracking-tight",
        h3: "mt-6 mb-2 text-xl font-semibold",
        h4: "mt-4 mb-2 text-lg font-semibold",
        h5: "mt-4 mb-2 font-semibold",
        h6: "mt-4 mb-2 font-medium text-muted-foreground",
      };
      const Tag = tag;
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
