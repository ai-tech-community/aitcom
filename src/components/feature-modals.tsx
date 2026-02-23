"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { BuildingModal } from "@/components/community/building-modal";
import { AsciiDonut } from "@/components/ascii-donut";
import { AsciiWave } from "@/components/ascii-wave";
import { AsciiNetwork } from "@/components/ascii-network";

type ModalKey = "workshops" | "knowledge" | "community";

const FEATURES: {
  key: ModalKey;
  fig: number;
  href: "/events" | "/blog" | "/community";
}[] = [
  { key: "workshops", fig: 1, href: "/events" },
  { key: "knowledge", fig: 2, href: "/blog" },
  { key: "community", fig: 3, href: "/community" },
];

export function FeatureModals() {
  const [openModals, setOpenModals] = useState<Set<ModalKey>>(new Set());
  const t = useTranslations("features");

  const openModal = useCallback((key: ModalKey) => {
    setOpenModals((prev) => new Set(prev).add(key));
  }, []);

  const closeModal = useCallback((key: ModalKey) => {
    setOpenModals((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const openList = Array.from(openModals);

  return (
    <>
      {/* Feature Cards */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feat) => (
          <button
            key={feat.fig}
            onClick={() => openModal(feat.key)}
            className="group border-border hover:border-foreground/30 overflow-hidden rounded-lg border border-dashed text-left transition-colors"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-wider">
                [ FIG. {feat.fig} ]
              </span>
              <ArrowUpRight className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 transition-colors" />
            </div>
            <div className="bg-secondary h-48 overflow-hidden">
              {feat.fig === 1 && <AsciiDonut />}
              {feat.fig === 2 && <AsciiWave />}
              {feat.fig === 3 && <AsciiNetwork />}
            </div>
            <div className="space-y-2 p-4 pb-5">
              <h3 className="text-lg font-bold">{t(`${feat.key}.title`)}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t(`${feat.key}.description`)}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Modals */}
      {FEATURES.map((feat) => (
        <FeatureModal
          key={feat.key}
          featureKey={feat.key}
          href={feat.href}
          isOpen={openModals.has(feat.key)}
          onClose={() => closeModal(feat.key)}
          windowIndex={openList.indexOf(feat.key)}
        />
      ))}
    </>
  );
}

function FeatureModal({
  featureKey,
  href,
  isOpen,
  onClose,
  windowIndex,
}: {
  featureKey: ModalKey;
  href: "/events" | "/blog" | "/community";
  isOpen: boolean;
  onClose: () => void;
  windowIndex: number;
}) {
  const t = useTranslations("features");
  const title = t(`${featureKey}.title`);
  const subtitle = t(`modal.${featureKey}.subtitle`);
  const cta = t(`modal.${featureKey}.cta`);

  // next-intl raw() to get the items array
  const items = t.raw(`modal.${featureKey}.items`) as {
    label: string;
    text: string;
  }[];

  return (
    <BuildingModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      windowIndex={windowIndex}
    >
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {item.label}
            </span>
            <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {item.text}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <Link
          href={href}
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </BuildingModal>
  );
}
