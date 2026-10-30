import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The markdown articles and threads are written in, rendered as elements.
 * Raw HTML is not enabled, and a link or image only keeps an http(s), mailto,
 * or same-site address.
 */
function textOf(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children))
    return children.map((child) => textOf(child)).join("");
  return "";
}

function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }
  return null;
}

const headingClass: Record<string, string> = {
  h1: "mt-8 mb-4 text-3xl font-semibold tracking-tight",
  h2: "mt-8 mb-3 text-2xl font-semibold tracking-tight",
  h3: "mt-6 mb-2 text-xl font-semibold",
  h4: "mt-4 mb-2 text-lg font-semibold",
  h5: "mt-4 mb-2 font-semibold",
  h6: "mt-4 mb-2 text-muted-foreground font-medium",
};

function heading(tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  const Tag = tag;
  const Component = ({ children }: { children?: ReactNode }) => (
    <Tag className={headingClass[tag]}>{children}</Tag>
  );
  Component.displayName = `Markdown${tag}`;
  return Component;
}

const components: Components = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  h5: heading("h5"),
  h6: heading("h6"),
  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-6">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  a: ({ href, children }) => {
    const safe = safeUrl(href);
    if (!safe) return <>{children}</>;
    const external = safe.startsWith("http:") || safe.startsWith("https:");
    return (
      <a
        href={safe}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-primary underline underline-offset-4 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    const safe = safeUrl(typeof src === "string" ? src : undefined);
    if (!safe) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- lesson markdown may point at any https image
      <img src={safe} alt={alt ?? ""} className="my-6 w-full rounded" />
    );
  },
  code: ({ className, children }) => {
    const value = textOf(children);
    const block =
      (className?.includes("language-") ?? false) || value.includes("\n");
    if (block) return <code className={className}>{children}</code>;
    return (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-sm">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-muted my-4 overflow-x-auto rounded p-4 font-mono text-sm leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-border border-b pr-3 pb-2 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-border border-b py-2 pr-3 align-top">{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-primary/40 text-muted-foreground my-4 border-l-4 pl-4 italic">
      {children}
    </blockquote>
  ),
};

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
