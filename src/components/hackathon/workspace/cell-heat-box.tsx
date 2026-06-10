"use client";

import { useTranslations } from "next-intl";

import type { RouterOutputs } from "@/trpc/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { HEAT_CLASS, HEAT_LABEL_KEY } from "./cell-heat";

export function CellHeatBox({
  cell,
  onClick,
}: {
  cell: RouterOutputs["teamWorkspace"]["cells"][number];
  onClick: () => void;
}) {
  const t = useTranslations("hackathon");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn("h-8 w-8 rounded", HEAT_CLASS[cell.heatState])}
          />
        </TooltipTrigger>
        <TooltipContent>{t(HEAT_LABEL_KEY[cell.heatState])}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
