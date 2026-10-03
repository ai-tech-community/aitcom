"use client";

import { CheckIcon, CircleAlertIcon, ClockIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { type BadgeTone, presentRun } from "@/lib/collectors/run-presentation";
import type { RunStatus, StopReason } from "@/server/collectors/run-status";

const ICONS: Record<BadgeTone, typeof CheckIcon> = {
  info: ClockIcon,
  success: CheckIcon,
  warning: CircleAlertIcon,
  destructive: XIcon,
};

/** A run's status as a semantic badge: colour plus icon plus label (DESIGN.md). */
export function RunStatusBadge({
  status,
  stopReason,
}: {
  status: RunStatus;
  stopReason: StopReason | null;
}) {
  const t = useTranslations("collectors.status");
  const { tone, label } = presentRun({ status, stopReason });
  const Icon = ICONS[tone];
  return (
    <Badge variant={tone}>
      <Icon aria-hidden="true" />
      {t(label)}
    </Badge>
  );
}
