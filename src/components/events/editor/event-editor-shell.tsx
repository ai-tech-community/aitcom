import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

/** The editor page frame: way back, title, then the editor. */
export function EventEditorShell({
  backHref,
  backLabel,
  title,
  subtitle,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
      <Link
        href={backHref}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {backLabel}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? (
        <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
      ) : null}
      <div className="mt-8">{children}</div>
    </main>
  );
}
