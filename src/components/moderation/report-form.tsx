"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** What a reporter has filled in so far; no reason until one is chosen. */
export type ReportDraft<Reason extends string> = {
  reason: Reason | null;
  note: string;
};

/** A report ready to send: the note trimmed, and left out when blank. */
export type ReportInput<Reason extends string> = {
  reason: Reason;
  note?: string;
};

/**
 * The body of a report dialog: the reasons as one radio group, an optional
 * note, and the send button. It holds no state and knows no copy or API:
 * the caller owns the draft, names things, and sends the report, so a
 * post's and a gallery item's report dialogs share one form.
 *
 * Send stays disabled until a reason is chosen and while a report is on
 * its way. `children` (a failure line, say) sit between the note and the
 * button.
 */
export function ReportForm<Reason extends string>({
  name,
  reasons,
  reasonLabel,
  draft,
  onDraftChange,
  noteMax,
  labels,
  pending,
  onSubmit,
  children,
}: {
  /** Unique on the page: names the radio group and the note field. */
  name: string;
  reasons: readonly Reason[];
  reasonLabel: (reason: Reason) => string;
  draft: ReportDraft<Reason>;
  onDraftChange: (draft: ReportDraft<Reason>) => void;
  noteMax: number;
  labels: { reasons: string; note: string; submit: string };
  pending: boolean;
  onSubmit: (report: ReportInput<Reason>) => void;
  children?: ReactNode;
}) {
  const noteId = `${name}-note`;
  const { reason } = draft;
  const canSend = reason !== null && !pending;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        const note = draft.note.trim();
        onSubmit({ reason, ...(note ? { note } : {}) });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{labels.reasons}</legend>
        {reasons.map((id) => (
          <label key={id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${name}-reason`}
              value={id}
              checked={reason === id}
              onChange={() => onDraftChange({ ...draft, reason: id })}
              className="focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
            />
            {reasonLabel(id)}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor={noteId}>{labels.note}</Label>
        <Textarea
          id={noteId}
          maxLength={noteMax}
          rows={3}
          className="resize-none"
          value={draft.note}
          onChange={(event) =>
            onDraftChange({ ...draft, note: event.target.value })
          }
        />
      </div>
      {children}
      <DialogFooter>
        <Button type="submit" disabled={!canSend}>
          {labels.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
