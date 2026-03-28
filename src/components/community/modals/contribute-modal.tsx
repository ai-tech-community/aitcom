"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BuildingModal } from "../building-modal";

type ContributeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  windowIndex?: number;
};

export function ContributeModal({
  isOpen,
  onClose,
  title,
  subtitle,
  windowIndex,
}: ContributeModalProps) {
  const t = useTranslations("community.contribute");

  const cards = [
    {
      key: "speak" as const,
      border: "border-orange-200",
      badge: "bg-orange-50 text-orange-400",
      href: null as string | null,
      disabled: true,
    },
    {
      key: "write" as const,
      border: "border-zinc-200 hover:border-zinc-300",
      badge: "bg-zinc-100 text-zinc-600",
      href: "/dashboard" as string | null,
      disabled: false,
    },
    {
      key: "mentor" as const,
      border: "border-zinc-200",
      badge: "bg-zinc-100 text-zinc-400",
      href: null as string | null,
      disabled: true,
    },
    {
      key: "partner" as const,
      border: "border-zinc-200",
      badge: "bg-zinc-100 text-zinc-400",
      href: null as string | null,
      disabled: true,
    },
  ];

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} windowIndex={windowIndex}>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, border, badge, href, disabled }) => (
          <div
            key={key}
            className={`rounded-lg border p-4 transition-colors ${border} ${disabled ? "opacity-50" : ""}`}
          >
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-900">
              {t(`${key}.title`)}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
              {t(`${key}.description`)}
            </p>
            <div className="mt-3">
              {disabled ? (
                <span
                  className={`inline-block rounded-md px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest ${badge}`}
                >
                  {t(`${key}.cta`)}
                </span>
              ) : href ? (
                <Link
                  href={href}
                  onClick={onClose}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors ${badge} hover:opacity-80`}
                >
                  {t(`${key}.cta`)}
                </Link>
              ) : (
                <button
                  className={`rounded-md px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors ${badge} hover:opacity-80`}
                >
                  {t(`${key}.cta`)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </BuildingModal>
  );
}
