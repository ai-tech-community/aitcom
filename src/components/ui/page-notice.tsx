import type { ReactNode } from "react";

/** A full-page recovery state that also works without the site navigation. */
export function PageNotice({
  symbol,
  title,
  description,
  children,
}: {
  symbol: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-background text-foreground flex min-h-[75svh] items-center px-6 py-16 sm:px-10">
      <div className="mx-auto grid w-full max-w-4xl gap-8 sm:grid-cols-[auto_1fr] sm:gap-12">
        <div
          className="text-muted-foreground sm:border-border sm:border-e sm:pe-12"
          aria-hidden="true"
        >
          {symbol}
        </div>
        <div className="max-w-xl min-w-0">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground mt-5 text-base leading-relaxed text-pretty">
            {description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
