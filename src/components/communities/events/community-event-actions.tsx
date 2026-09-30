"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle,
  Clock,
  Pencil,
  Settings2,
  XCircle,
  XOctagon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Organiser controls and status words for a community's event rows. They
 * plug into the shared rows' `actions` and `status` slots, so the row's
 * date, title and place stay the one shared design. Every control is named
 * by its own visible words (an icon is only a cue beside them) and is at
 * least 32px tall.
 */

/**
 * A group of controls on an event row.
 * - `beside` (default): next to the body on wide screens. For one or two
 *   short controls; it never shrinks, so the body gives way to it.
 * - `below`: its own full line under the row on every screen, lined up
 *   with the title: the title column starts at 11rem (8rem date block +
 *   2rem gap + 1rem row padding), less the small icon button's 0.625rem
 *   padding so the first icon sits under the title's first letter. For the
 *   organiser's wider set of controls, which beside the body would squeeze
 *   the title to a few letters per line.
 */
export function RowActions({
  children,
  className,
  placement = "beside",
}: {
  children: ReactNode;
  className?: string;
  placement?: "beside" | "below";
}) {
  return (
    <div
      data-slot="event-row-actions"
      data-placement={placement}
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1",
        placement === "beside"
          ? "sm:shrink-0"
          : "order-last basis-full sm:-mt-3 sm:pb-4 sm:pl-[10.375rem]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Opens a hackathon's manage page: navigation, so a link, not a button. */
export function ManageHackathonLink({ href }: { href: string }) {
  const t = useTranslations("hackathon");
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>
        <Settings2 aria-hidden="true" />
        {t("manage")}
      </Link>
    </Button>
  );
}

export function EditEventButton({ onEdit }: { onEdit: () => void }) {
  const t = useTranslations("events");
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
      <Pencil aria-hidden="true" />
      {t("editShort")}
    </Button>
  );
}

export function CancelEventButton({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("events");
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      // Quiet at rest (it repeats on every row); red once aimed at, and
      // the confirm dialog that follows is the destructive one.
      className="text-muted-foreground hover:text-destructive focus-visible:text-destructive"
      onClick={onCancel}
    >
      <XCircle aria-hidden="true" />
      {t("cancelEvent")}
    </Button>
  );
}

export function ResubmitEventButton({
  onResubmit,
}: {
  onResubmit: () => void;
}) {
  const t = useTranslations("events");
  return (
    <Button type="button" variant="outline" size="sm" onClick={onResubmit}>
      <Pencil aria-hidden="true" />
      {t("editAndResubmit")}
    </Button>
  );
}

/** Approve and reject for the moderators' queue; both off while one runs. */
export function ReviewButtons({
  busy,
  onApprove,
  onReject,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = useTranslations("events");
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-success/40 text-success hover:bg-success/10 hover:text-success"
        disabled={busy}
        onClick={onApprove}
      >
        <CheckCircle aria-hidden="true" />
        {t("approve")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={busy}
        onClick={onReject}
      >
        <XOctagon aria-hidden="true" />
        {t("reject")}
      </Button>
    </>
  );
}

/** Statuses a member's own submissions can be in, before publishing. */
const NOTED_STATUSES: ReadonlySet<string> = new Set(["draft", "rejected"]);

/** Whether a row in this status carries a status note at all. */
export function hasStatusNote(status: string): boolean {
  return NOTED_STATUSES.has(status);
}

/**
 * Where a submission stands, in words with a matching icon (never colour
 * alone). Renders nothing for a status without a note (see `hasStatusNote`).
 */
export function EventStatusNote({ status }: { status: string }) {
  const t = useTranslations("events");
  const note =
    status === "rejected"
      ? {
          icon: XOctagon,
          label: t("rejectedEditResubmit"),
          tone: "text-destructive",
        }
      : status === "draft"
        ? {
            icon: Clock,
            label: t("pendingApproval"),
            tone: "text-warning",
          }
        : null;
  if (!note) return null;
  const Icon = note.icon;
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs font-medium tracking-wider uppercase",
        note.tone,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {note.label}
    </span>
  );
}
