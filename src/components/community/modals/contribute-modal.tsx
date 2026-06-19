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
      border: "border-border hover:border-border",
      badge: "bg-muted text-foreground",
      href: "/dashboard" as string | null,
      disabled: false,
    },
    {
      key: "mentor" as const,
      border: "border-border",
      badge: "bg-muted text-muted-foreground",
      href: null as string | null,
      disabled: true,
    },
    {
      key: "partner" as const,
      border: "border-border",
      badge: "bg-muted text-muted-foreground",
      href: null as string | null,
      disabled: true,
    },
  ];

  return (
    <BuildingModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      windowIndex={windowIndex}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, border, badge, href, disabled }) => (
          <div
            key={key}
            className={`rounded-lg border p-4 transition-colors ${border} ${disabled ? "opacity-50" : ""}`}
          >
            <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
              {t(`${key}.title`)}
            </h3>
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
              {t(`${key}.description`)}
            </p>
            <div className="mt-3">
              {disabled ? (
                <span
                  className={`inline-block rounded-md px-2.5 py-1 font-mono text-xs font-semibold tracking-widest uppercase ${badge}`}
                >
                  {t(`${key}.cta`)}
                </span>
              ) : href ? (
                <Link
                  href={href}
                  onClick={onClose}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-xs font-semibold tracking-widest uppercase transition-colors ${badge} hover:opacity-80`}
                >
                  {t(`${key}.cta`)}
                </Link>
              ) : (
                <button
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold tracking-widest uppercase transition-colors ${badge} hover:opacity-80`}
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
