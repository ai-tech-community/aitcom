import React from "react";

/* -------------------------------------------------------------------------- */
/*  ManPageLayout                                                             */
/* -------------------------------------------------------------------------- */

interface ManPageLayoutProps {
  pageName: string;
  section?: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export function ManPageLayout({
  pageName,
  section = "7",
  lastUpdated,
  children,
}: ManPageLayoutProps) {
  const tag = `${pageName.toUpperCase()}(${section})`;

  return (
    <article className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-12">
      {/* Header */}
      <div className="text-muted-foreground border-border flex items-center justify-between border-b pb-3 font-mono text-xs tracking-wider">
        <span>{tag}</span>
        <span className="hidden sm:block">AIT Community</span>
        <span>{tag}</span>
      </div>

      {/* Content */}
      <div className="py-8">{children}</div>

      {/* Footer */}
      <div className="text-muted-foreground border-border flex items-center justify-between border-t pt-3 font-mono text-xs tracking-wider">
        <span>AIT Community</span>
        <span className="hidden sm:block">{lastUpdated}</span>
        <span>{tag}</span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  ManPageSection                                                            */
/* -------------------------------------------------------------------------- */

interface ManPageSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function ManPageSection({ id, title, children }: ManPageSectionProps) {
  return (
    <section id={id} className="mb-8 scroll-mt-24">
      <h2 className="font-mono text-sm font-bold tracking-wider uppercase">
        {title}
      </h2>
      <div className="text-muted-foreground mt-3 pl-6 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ManPageToc                                                                */
/* -------------------------------------------------------------------------- */

interface ManPageTocProps {
  items: Array<{ id: string; label: string }>;
}

export function ManPageToc({ items }: ManPageTocProps) {
  return (
    <div className="border-border mb-8 rounded border p-4">
      <p className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wider">
        TABLE OF CONTENTS
      </p>
      <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        {items.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="text-primary font-mono text-xs tracking-wider hover:underline"
          >
            {i + 1}. {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
