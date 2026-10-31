"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
  SheetFooter,
} from "@/components/ui/sheet";
import { jobHttpUrl } from "@/lib/job-boards/job-board";

type Row = Record<string, unknown>;
const columns = [
  "title",
  "location",
  "department",
  "employmentType",
  "workplaceType",
  "postedAt",
] as const;
const employmentValues = [
  "FullTime",
  "PartTime",
  "Intern",
  "Contract",
  "Temporary",
] as const;
const workplaceValues = ["Remote", "Hybrid", "OnSite"] as const;
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

/** Job descriptions stay out of the table so even long postings remain scannable. */
export function JobResults({ rows }: { rows: readonly Row[] }) {
  const t = useTranslations("collectors.jobDetails");
  const locale = useLocale();
  function value(row: Row, column: (typeof columns)[number]): string {
    const raw = text(row[column]);
    if (!raw) return "—";
    if (column === "employmentType") {
      const known = employmentValues.find((key) => key === raw);
      if (known) return t(`employment.${known}`);
    }
    if (column === "workplaceType") {
      const known = workplaceValues.find((key) => key === raw);
      if (known) return t(`workplace.${known}`);
    }
    if (column === "postedAt") {
      const date = new Date(raw);
      return Number.isFinite(date.getTime())
        ? date.toLocaleDateString(
            locale,
            /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { timeZone: "UTC" } : undefined,
          )
        : "—";
    }
    return raw;
  }
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">{t("table")}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="text-muted-foreground border-border border-b px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap"
              >
                {t(`columns.${column}`)}
              </th>
            ))}
            <th scope="col" className="border-border border-b px-3 py-2.5">
              <span className="sr-only">{t("details")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const title = text(row.title) ?? t("untitled");
            const sourceUrl = jobHttpUrl(row.url);
            const applyUrl = jobHttpUrl(row.applyUrl);
            const description = text(row.description);
            const older = !Object.hasOwn(row, "description");
            return (
              <tr key={index}>
                {columns.map((column) => (
                  <td
                    key={column}
                    className="border-border border-b px-3 py-2.5 align-top"
                  >
                    {value(row, column)}
                  </td>
                ))}
                <td className="border-border border-b px-3 py-2.5 align-top">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t("viewNamed", { title })}
                      >
                        {t("view")}
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      className="w-full gap-0 sm:max-w-2xl"
                      showCloseButton={false}
                    >
                      <SheetHeader className="border-border shrink-0 border-b p-6">
                        <SheetClose asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="self-end"
                          >
                            {t("close")}
                          </Button>
                        </SheetClose>
                        <SheetTitle className="text-xl wrap-anywhere">
                          {title}
                        </SheetTitle>
                        <SheetDescription>
                          {[text(row.location), text(row.department)]
                            .filter(Boolean)
                            .join(" · ") || t("details")}
                        </SheetDescription>
                      </SheetHeader>
                      <div className="min-h-0 flex-1 overflow-y-auto p-6">
                        <dl className="mb-6 grid grid-cols-2 gap-4 text-sm">
                          {(
                            [
                              "employmentType",
                              "workplaceType",
                              "postedAt",
                            ] as const
                          ).map((column) => (
                            <div key={column}>
                              <dt className="text-muted-foreground mb-1">
                                {t(`columns.${column}`)}
                              </dt>
                              <dd>{value(row, column)}</dd>
                            </div>
                          ))}
                        </dl>
                        <h3 className="mb-3 text-base font-semibold">
                          {t("description")}
                        </h3>
                        {description ? (
                          <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
                            {description}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            {t(older ? "older" : "missing")}
                          </p>
                        )}
                        {row.descriptionTruncated === true ? (
                          <p className="text-muted-foreground mt-4 text-sm">
                            {t("truncated")}
                          </p>
                        ) : null}
                      </div>
                      {applyUrl || sourceUrl ? (
                        <SheetFooter className="border-border shrink-0 border-t p-6">
                          {applyUrl ? (
                            <Button asChild>
                              <a
                                href={applyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("apply")}
                              </a>
                            </Button>
                          ) : null}
                          {sourceUrl && sourceUrl !== applyUrl ? (
                            <Button asChild variant="outline">
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("source")}
                              </a>
                            </Button>
                          ) : null}
                        </SheetFooter>
                      ) : null}
                    </SheetContent>
                  </Sheet>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
