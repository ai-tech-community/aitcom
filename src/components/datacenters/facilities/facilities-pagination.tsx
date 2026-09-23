import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  FACILITY_PARAM,
  patchSearchParams,
  paginationRange,
} from "@/lib/investigations/facilities-query";
import { cn } from "@/lib/utils";
import { FacilitiesLink } from "./facilities-navigation";
import { FacilitiesPageSize } from "./facilities-page-size";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function FacilitiesPagination({
  page,
  pageCount,
  pageSize,
  total,
  query,
  locale,
  t,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  query: string;
  locale: string;
  /** Translator scoped to `datacenterInvestigation.facilities`. */
  t: Translate;
}) {
  const number = new Intl.NumberFormat(locale);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pageQuery = (p: number) =>
    patchSearchParams(query, {
      [FACILITY_PARAM.page]: p > 1 ? String(p) : null,
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p
        className="text-muted-foreground text-sm tabular-nums"
        aria-live="polite"
      >
        {t("range", {
          from: number.format(from),
          to: number.format(to),
          total: number.format(total),
        })}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <FacilitiesPageSize pageSize={pageSize} />

        {pageCount > 1 && (
          <nav aria-label={t("pagination")}>
            <ul className="flex items-center gap-1">
              <li>
                <PageStep
                  label={t("previous")}
                  query={page > 1 ? pageQuery(page - 1) : null}
                >
                  <ChevronLeftIcon aria-hidden />
                </PageStep>
              </li>
              {paginationRange(page, pageCount).map((p, i) =>
                p === "gap" ? (
                  <li
                    key={`gap-${i}`}
                    aria-hidden
                    className="text-muted-foreground hidden w-6 text-center sm:block"
                  >
                    …
                  </li>
                ) : (
                  <li key={p} className={cn(p !== page && "hidden sm:block")}>
                    <FacilitiesLink
                      query={pageQuery(p)}
                      aria-label={t("pageNumber", { page: p })}
                      aria-current={p === page ? "page" : undefined}
                      className={cn(
                        buttonVariants({
                          variant: p === page ? "outline" : "ghost",
                          size: "icon-sm",
                        }),
                        "font-mono tabular-nums",
                        p !== page && "text-muted-foreground",
                      )}
                    >
                      {number.format(p)}
                    </FacilitiesLink>
                  </li>
                ),
              )}
              <li>
                <PageStep
                  label={t("next")}
                  query={page < pageCount ? pageQuery(page + 1) : null}
                >
                  <ChevronRightIcon aria-hidden />
                </PageStep>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

/** Previous/next. At either end it stays in place, visibly disabled, so the bar never shifts. */
function PageStep({
  label,
  query,
  children,
}: {
  label: string;
  query: string | null;
  children: React.ReactNode;
}) {
  const className = buttonVariants({ variant: "ghost", size: "icon-sm" });
  if (query === null) {
    return (
      <span
        role="link"
        aria-label={label}
        aria-disabled="true"
        className={cn(className, "pointer-events-none opacity-50")}
      >
        {children}
      </span>
    );
  }
  return (
    <FacilitiesLink query={query} aria-label={label} className={className}>
      {children}
    </FacilitiesLink>
  );
}
