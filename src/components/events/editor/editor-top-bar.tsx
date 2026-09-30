"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * The editor's one row of chrome, like the course builder's: the way back,
 * what you are editing, and the single orange action. The Save button
 * submits the editor's form from outside it (`form=`), so it stays in reach
 * however far down the page you are.
 */
export function EditorTopBar({
  backHref,
  backLabel,
  title,
  subtitle,
  formId,
  submitLabel,
  pending,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  formId: string;
  submitLabel: string;
  pending: boolean;
}) {
  const t = useTranslations("events.editor");
  return (
    <div className="border-border bg-background sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 sm:px-6 lg:static">
      <Button asChild variant="ghost" size="icon" className="shrink-0">
        <Link href={backHref} aria-label={t("backTo", { name: backLabel })}>
          <ArrowLeft aria-hidden="true" />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base leading-tight font-semibold">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground truncate text-sm">{subtitle}</p>
        ) : null}
      </div>
      <Button asChild variant="ghost" className="hidden sm:inline-flex">
        <Link href={backHref}>{t("cancel")}</Link>
      </Button>
      <Button type="submit" form={formId} disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : null}
        {submitLabel}
      </Button>
    </div>
  );
}
