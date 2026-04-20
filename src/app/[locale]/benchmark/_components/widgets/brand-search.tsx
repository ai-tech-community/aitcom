"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function BrandSearchWidget() {
  const t = useTranslations("benchmark");
  const [slug, setSlug] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">{t("widgets.brandSearch.title")}</h3>
      <div className="flex gap-2">
        <Input
          placeholder={t("widgets.brandSearch.slugPlaceholder")}
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
        />
        <Button asChild disabled={!slug}>
          <Link href={`/benchmark/brands/${slug}`}>{t("widgets.brandSearch.open")}</Link>
        </Button>
      </div>
    </div>
  );
}
