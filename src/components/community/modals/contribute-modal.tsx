"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BuildingModal } from "../building-modal";

type ContributeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
};

export function ContributeModal({
  isOpen,
  onClose,
  title,
  subtitle,
}: ContributeModalProps) {
  const t = useTranslations("community.contribute");

  const cards = [
    {
      key: "speak" as const,
      color: "border-orange-800/50 hover:border-orange-700",
      badge: "bg-orange-500/10 text-orange-400",
      href: null as string | null,
      disabled: false,
    },
    {
      key: "write" as const,
      color: "border-zinc-800 hover:border-zinc-700",
      badge: "bg-zinc-800 text-zinc-400",
      href: "/dashboard" as string | null,
      disabled: false,
    },
    {
      key: "mentor" as const,
      color: "border-zinc-800",
      badge: "bg-zinc-800 text-zinc-600",
      href: null as string | null,
      disabled: true,
    },
    {
      key: "partner" as const,
      color: "border-zinc-800 hover:border-zinc-700",
      badge: "bg-zinc-800 text-zinc-400",
      href: null as string | null,
      disabled: false,
    },
  ];

  return (
    <BuildingModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, color, badge, href, disabled }) => (
          <div
            key={key}
            className={`rounded-lg border p-4 transition-colors ${color} ${disabled ? "opacity-50" : ""}`}
          >
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-200">
              {t(`${key}.title`)}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
              {t(`${key}.description`)}
            </p>
            <div className="mt-3">
              {disabled ? (
                <span
                  className={`inline-block rounded px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest ${badge}`}
                >
                  {t(`${key}.cta`)}
                </span>
              ) : href ? (
                <Link
                  href={href}
                  onClick={onClose}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors ${badge} hover:opacity-80`}
                >
                  {t(`${key}.cta`)}
                </Link>
              ) : (
                <button
                  className={`rounded px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors ${badge} hover:opacity-80`}
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
