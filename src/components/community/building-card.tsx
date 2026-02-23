"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { IsometricBuilding } from "./isometric-building";

type BuildingCardProps = {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  size?: "sm" | "md" | "lg";
  accent?: boolean;
  onClick: () => void;
};

const sizeConfig = {
  sm: { buildingSize: 50, buildingHeight: 55, windows: 1 },
  md: { buildingSize: 65, buildingHeight: 75, windows: 2 },
  lg: { buildingSize: 80, buildingHeight: 100, windows: 3 },
};

export function BuildingCard({
  icon: Icon,
  label,
  sublabel,
  size = "md",
  accent = false,
  onClick,
}: BuildingCardProps) {
  const cfg = sizeConfig[size];

  return (
    <motion.button
      className="group flex cursor-pointer flex-col items-center gap-2 p-4 focus:outline-none"
      onClick={onClick}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      aria-label={label}
    >
      <div
        className="relative"
        style={{
          filter: accent
            ? "drop-shadow(0 0 12px rgb(249 115 22 / 0.4))"
            : "drop-shadow(0 4px 6px rgb(0 0 0 / 0.5))",
          transition: "filter 0.2s",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ opacity: 0 }}
        >
          <div
            className="h-full w-full rounded-full opacity-30 blur-xl"
            style={{
              background: accent
                ? "rgb(249 115 22)"
                : "rgb(161 161 170)",
            }}
          />
        </div>

        <IsometricBuilding
          size={cfg.buildingSize}
          height={cfg.buildingHeight}
          windows={cfg.windows}
          accent={accent ? "#f97316" : "#f97316"}
        />
      </div>

      <div
        className="absolute -mt-2 flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-200 group-hover:border-orange-500/50 group-hover:text-orange-400"
        style={{
          marginTop: -(cfg.buildingHeight * 0.4),
          marginLeft: cfg.buildingSize * 0.9,
          borderColor: accent ? "rgb(249 115 22 / 0.5)" : "rgb(63 63 70)",
          backgroundColor: accent ? "rgb(249 115 22 / 0.1)" : "rgb(39 39 42)",
          color: accent ? "rgb(251 146 60)" : "rgb(161 161 170)",
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="flex flex-col items-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-300 transition-colors duration-200 group-hover:text-white">
          {label}
        </span>
        <span className="font-mono text-[9px] tracking-wide text-zinc-600 transition-colors duration-200 group-hover:text-zinc-500">
          {sublabel}
        </span>
      </div>
    </motion.button>
  );
}
