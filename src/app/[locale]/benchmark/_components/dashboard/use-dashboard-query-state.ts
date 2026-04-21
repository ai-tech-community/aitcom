// src/app/[locale]/benchmark/_components/dashboard/use-dashboard-query-state.ts
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type WindowDays = 7 | 30 | 90;

export type DashboardState = {
  categorySlug: string | null;
  windowDays: WindowDays;
  modelScope: string;
};

const VALID_WINDOWS = [7, 30, 90] as const;

function coerceWindow(raw: string | null): WindowDays {
  const n = raw ? Number(raw) : NaN;
  return (VALID_WINDOWS as readonly number[]).includes(n) ? (n as WindowDays) : 30;
}

export function useDashboardQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state: DashboardState = {
    categorySlug: params.get("c"),
    windowDays: coerceWindow(params.get("w")),
    modelScope: params.get("m") ?? "all",
  };

  const update = useCallback(
    (patch: Partial<DashboardState>) => {
      const next = new URLSearchParams(params.toString());
      const merged: DashboardState = { ...state, ...patch };

      if (merged.categorySlug) next.set("c", merged.categorySlug);
      else next.delete("c");

      if (merged.windowDays !== 30) next.set("w", String(merged.windowDays));
      else next.delete("w");

      if (merged.modelScope !== "all") next.set("m", merged.modelScope);
      else next.delete("m");

      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, state],
  );

  const buildShareUrl = useCallback(
    (base?: string) => {
      const origin =
        base ??
        (typeof window !== "undefined" ? window.location.origin : "");
      const qs = params.toString();
      return qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;
    },
    [params, pathname],
  );

  return { state, update, buildShareUrl };
}
