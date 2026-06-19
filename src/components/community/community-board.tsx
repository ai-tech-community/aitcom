"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { RulesModal } from "./modals/rules-modal";
import { IdeasModal } from "./modals/ideas-modal";
import { ContributeModal } from "./modals/contribute-modal";

type ModalKey = "rules" | "ideas" | "contribute";

const dotVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 20 },
  },
};

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.2, delayChildren: 0.5 },
  },
};

export function CommunityBoard() {
  // Set of open modals - multiple can be open at once
  const [openModals, setOpenModals] = useState<Set<ModalKey>>(new Set());
  const t = useTranslations("community");
  const router = useRouter();

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

  // Track order for cascade offset
  const openList = Array.from(openModals);

  const hotspots = [
    {
      key: "rules" as ModalKey,
      label: t("rules.building"),
      top: "72%",
      left: "60%",
    },
    {
      key: "ideas" as ModalKey,
      label: t("ideas.building"),
      top: "41%",
      left: "58%",
    },
    {
      key: "threads" as const,
      label: t("threads.building"),
      top: "12%",
      left: "34%",
      href: "/forum" as const,
    },
    {
      key: "contribute" as ModalKey,
      label: t("contribute.building"),
      top: "84%",
      left: "70%",
    },
  ];

  return (
    <LazyMotion features={domAnimation}>
      {/* Full viewport town map */}
      <div className="relative min-h-screen w-full overflow-hidden">
        {/* Background image fills entire viewport */}
        <Image
          src="/images/isometric-illustrated-town-square_16_9.png"
          alt="Community town square"
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />

        {/* Title overlay - compact on mobile so it doesn't cover hotspots */}
        <div className="bg-card/85 absolute top-3 left-3 z-20 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm sm:top-8 sm:left-8 sm:px-5 sm:py-4">
          <span className="text-muted-foreground hidden font-mono text-xs font-medium tracking-wider sm:block">
            / {t("title").toUpperCase()}
          </span>
          <h1 className="text-foreground text-sm font-semibold tracking-tight sm:text-2xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-0.5 hidden max-w-xs text-xs sm:block">
            {t("subtitle")}
          </p>
        </div>

        <div className="absolute top-20 right-3 left-3 z-20 flex flex-wrap gap-2 sm:top-36 sm:right-auto sm:left-8">
          <button
            type="button"
            onClick={() => openModal("rules")}
            className="bg-card/90 text-foreground hover:bg-card rounded-full px-3 py-1.5 font-mono text-xs font-semibold tracking-wider shadow backdrop-blur-sm transition-colors"
          >
            {t("rules.building")}
          </button>
          <button
            type="button"
            onClick={() => openModal("ideas")}
            className="bg-card/90 text-foreground hover:bg-card rounded-full px-3 py-1.5 font-mono text-xs font-semibold tracking-wider shadow backdrop-blur-sm transition-colors"
          >
            {t("ideas.building")}
          </button>
          <Link
            href="/forum"
            className="bg-card/90 text-foreground hover:bg-card rounded-full px-3 py-1.5 font-mono text-xs font-semibold tracking-wider shadow backdrop-blur-sm transition-colors"
          >
            {t("threads.building")}
          </Link>
          <button
            type="button"
            onClick={() => openModal("contribute")}
            className="bg-card/90 text-foreground hover:bg-card rounded-full px-3 py-1.5 font-mono text-xs font-semibold tracking-wider shadow backdrop-blur-sm transition-colors"
          >
            {t("contribute.building")}
          </button>
        </div>

        {/* Dot markers on buildings */}
        <m.div
          className="absolute inset-0 z-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {hotspots.map((spot) => (
            <m.button
              key={spot.key}
              className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={{ top: spot.top, left: spot.left }}
              variants={dotVariants}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() =>
                spot.href ? router.push(spot.href) : openModal(spot.key)
              }
              aria-label={spot.label}
            >
              {/* Outer pulse ring */}
              <span className="absolute -inset-2 animate-ping rounded-full bg-orange-400/25 sm:-inset-3" />
              {/* Steady glow ring */}
              <span className="absolute -inset-1.5 rounded-full bg-orange-400/20 sm:-inset-2" />
              {/* Dot */}
              <span className="relative block h-4 w-4 rounded-full border-2 border-white bg-orange-500 shadow-lg transition-colors group-hover:bg-orange-600 sm:h-5 sm:w-5 sm:border-[2.5px]" />
              {/* Label - always visible on mobile, hover-only on desktop */}
              <span className="bg-card/90 text-foreground pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap shadow backdrop-blur-sm sm:mt-2 sm:rounded-md sm:px-3 sm:py-1.5 sm:text-xs sm:opacity-0 sm:shadow-lg sm:transition-opacity sm:group-hover:opacity-100">
                {spot.label}
              </span>
            </m.button>
          ))}
        </m.div>
      </div>

      {/* Modals - all rendered, each independently open/closed */}
      <RulesModal
        isOpen={openModals.has("rules")}
        onClose={() => closeModal("rules")}
        title={t("rules.title")}
        subtitle={t("rules.subtitle")}
        windowIndex={openList.indexOf("rules")}
      />
      <IdeasModal
        isOpen={openModals.has("ideas")}
        onClose={() => closeModal("ideas")}
        title={t("ideas.title")}
        subtitle={t("ideas.subtitle")}
        windowIndex={openList.indexOf("ideas")}
      />
      <ContributeModal
        isOpen={openModals.has("contribute")}
        onClose={() => closeModal("contribute")}
        title={t("contribute.title")}
        subtitle={t("contribute.subtitle")}
        windowIndex={openList.indexOf("contribute")}
      />
    </LazyMotion>
  );
}
