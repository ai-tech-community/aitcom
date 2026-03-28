"use client";

import { useLocale } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const otherLocale =
    routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  function switchLocale() {
    router.replace(pathname, { locale: otherLocale });
  }

  return (
    <button
      onClick={switchLocale}
      className="border-border text-muted-foreground hover:border-foreground hover:text-foreground flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] transition-colors"
    >
      <Globe className="h-3.5 w-3.5" />
      {otherLocale.toUpperCase()}
    </button>
  );
}
