import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Link } from "@/i18n/navigation";
import { appPathFromGuideHref } from "@/lib/seo-guides";
import { SectionLabel } from "@/components/ui/section-label";

const linkClassName =
  "underline-offset-4 hover:text-foreground hover:underline";

function GuideLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!href) return <>{children}</>;
  const appPath = appPathFromGuideHref(href);
  if (appPath) {
    return (
      <Link href={appPath} className={linkClassName}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={linkClassName}>
      {children}
    </a>
  );
}

const components: Components = {
  h2: ({ children }) => (
    <SectionLabel className="mt-12 first:mt-0">{children}</SectionLabel>
  ),
  p: ({ children }) => (
    <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="text-muted-foreground list-inside list-disc space-y-1.5 text-sm leading-relaxed">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="text-muted-foreground list-inside list-decimal space-y-1.5 text-sm leading-relaxed">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => <GuideLink href={href}>{children}</GuideLink>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-foreground text-background overflow-x-auto rounded px-3 py-2 font-mono text-xs">
      {children}
    </pre>
  ),
};

export function GuideMarkdown({ children }: { children: string }) {
  return (
    <div className="mt-16 max-w-2xl space-y-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
