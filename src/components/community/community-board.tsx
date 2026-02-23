"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Scale, Lightbulb, MessageSquare, Wrench } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { BuildingCard } from "./building-card";
import { RulesModal } from "./modals/rules-modal";
import { IdeasModal } from "./modals/ideas-modal";
import { ThreadsModal } from "./modals/threads-modal";
import { ContributeModal } from "./modals/contribute-modal";

type ActiveModal = "rules" | "ideas" | "threads" | "contribute" | null;

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const buildingVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 200, damping: 20 },
  },
};

export function CommunityBoard() {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const t = useTranslations("community");
  const locale = useLocale();

  const buildings = [
    {
      key: "rules" as const,
      icon: Scale,
      label: t("rules.building"),
      sublabel: t("rules.subtitle"),
      size: "sm" as const,
      accent: false,
      style: { top: "15%", left: "12%" },
    },
    {
      key: "ideas" as const,
      icon: Lightbulb,
      label: t("ideas.building"),
      sublabel: t("ideas.subtitle"),
      size: "lg" as const,
      accent: true,
      style: { top: "30%", left: "38%" },
    },
    {
      key: "threads" as const,
      icon: MessageSquare,
      label: t("threads.building"),
      sublabel: t("threads.subtitle"),
      size: "md" as const,
      accent: false,
      style: { top: "12%", right: "18%" },
    },
    {
      key: "contribute" as const,
      icon: Wrench,
      label: t("contribute.building"),
      sublabel: t("contribute.subtitle"),
      size: "md" as const,
      accent: false,
      style: { bottom: "20%", right: "12%" },
    },
  ];

  return (
    <>
      <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950">
        {/* Graph-paper grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgb(39 39 42 / 0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgb(39 39 42 / 0.5) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Ambient glow */}
        <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-orange-500/5 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-500/5 blur-3xl" />

        {/* Page breadcrumb */}
        <div className="absolute left-6 top-6 z-10">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            / {t("title").toUpperCase()}
          </span>
        </div>

        {/* Subtitle */}
        <div className="absolute bottom-6 left-6 z-10">
          <p className="max-w-xs font-mono text-[9px] leading-relaxed text-zinc-700">
            {t("subtitle")}
          </p>
        </div>

        {/* Mobile layout: 2x2 grid */}
        <div className="flex min-h-screen items-center justify-center md:hidden">
          <motion.div
            className="grid grid-cols-2 gap-6 p-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {buildings.map((b) => (
              <motion.div key={b.key} variants={buildingVariants}>
                <BuildingCard
                  icon={b.icon}
                  label={b.label}
                  sublabel={b.sublabel}
                  size={b.size}
                  accent={b.accent}
                  onClick={() => setActiveModal(b.key)}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Desktop layout: scattered absolute positioning */}
        <motion.div
          className="relative hidden h-screen w-full md:block"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {buildings.map((b) => (
            <motion.div
              key={b.key}
              className="absolute"
              style={b.style}
              variants={buildingVariants}
            >
              <BuildingCard
                icon={b.icon}
                label={b.label}
                sublabel={b.sublabel}
                size={b.size}
                accent={b.accent}
                onClick={() => setActiveModal(b.key)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Modals */}
      <RulesModal
        isOpen={activeModal === "rules"}
        onClose={() => setActiveModal(null)}
        title={t("rules.title")}
        subtitle={t("rules.subtitle")}
      />
      <IdeasModal
        isOpen={activeModal === "ideas"}
        onClose={() => setActiveModal(null)}
        title={t("ideas.title")}
        subtitle={t("ideas.subtitle")}
      />
      <ThreadsModal
        isOpen={activeModal === "threads"}
        onClose={() => setActiveModal(null)}
        title={t("threads.title")}
        subtitle={t("threads.subtitle")}
        locale={locale}
      />
      <ContributeModal
        isOpen={activeModal === "contribute"}
        onClose={() => setActiveModal(null)}
        title={t("contribute.title")}
        subtitle={t("contribute.subtitle")}
      />
    </>
  );
}
