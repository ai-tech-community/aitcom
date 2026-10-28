"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("language");
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className="border-border text-muted-foreground hover:border-foreground hover:text-foreground focus-within:ring-ring flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-xs transition-colors focus-within:ring-2">
      <Globe aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        onChange={(event) => {
          const nextLocale = routing.locales.find(
            (candidate) => candidate === event.target.value,
          );
          if (nextLocale) {
            router.replace(
              `${pathname}${window.location.search}${window.location.hash}`,
              { locale: nextLocale },
            );
          }
        }}
        className="bg-background min-w-0 cursor-pointer rounded-sm py-0.5 outline-none"
      >
        {routing.locales.map((supported) => (
          <option key={supported} value={supported} lang={supported}>
            {t(supported)}
          </option>
        ))}
      </select>
    </label>
  );
}
