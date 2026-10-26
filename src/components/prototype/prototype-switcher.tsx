"use client";

// PROTOTYPE — throwaway. A floating bar that flips between UI variants via the
// `?variant=` search param. Never rendered in production builds.

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: ReadonlyArray<PrototypeVariant>;
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length]!;
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`${pathname}?${params.toString()}` as never, {
      scroll: false,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const v = variants[index]!;
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 font-mono text-xs text-white shadow-lg ring-1 ring-white/20">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => go(-1)}
        className="rounded-full p-1.5 hover:bg-white/15"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 px-2 text-center">
        PROTOTYPE · {v.key} — {v.name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => go(1)}
        className="rounded-full p-1.5 hover:bg-white/15"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
