"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { PageNotice } from "@/components/ui/page-notice";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <PageNotice
      symbol={
        <span className="font-mono text-7xl leading-none font-medium sm:text-8xl">
          404
        </span>
      }
      title={t("title")}
      description={t("description")}
    >
      <Button asChild size="lg" className="h-auto min-h-11 whitespace-normal">
        <Link href="/">{t("home")}</Link>
      </Button>
      <Button
        asChild
        variant="outline"
        size="lg"
        className="h-auto min-h-11 whitespace-normal"
      >
        <Link href="/magazines">{t("magazines")}</Link>
      </Button>
    </PageNotice>
  );
}
