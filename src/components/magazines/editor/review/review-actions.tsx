"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { communityMagazinePath } from "@/lib/magazines/paths";
import { REVIEW_NOTE_MAX, type ReviewDecision } from "@/lib/magazines/review";
import { api } from "@/trpc/react";

import { readEditorError, type EditorErrorKey } from "../editor-errors";

export function ReviewActions({
  communitySlug,
  articleId,
  articleTitle,
}: {
  communitySlug: string;
  articleId: number;
  articleTitle: string;
}) {
  const t = useTranslations("magazineEditor.review");
  const tErrors = useTranslations("magazineEditor.errors");
  const router = useRouter();
  const id = useId();
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [error, setError] = useState<EditorErrorKey | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const changesRef = useRef<HTMLTextAreaElement>(null);
  const refusalRef = useRef<HTMLParagraphElement>(null);
  // Also guard clicks before React has rendered the mutation's pending state.
  const inFlight = useRef(false);

  useEffect(() => {
    if (changesOpen) changesRef.current?.focus();
  }, [changesOpen]);

  useEffect(() => {
    if (error) refusalRef.current?.focus();
  }, [error]);

  const utils = api.useUtils();
  const review = api.magazines.reviewArticle.useMutation({
    onSuccess: ({ reviewStatus }) => {
      if (reviewStatus === "approved") {
        void utils.magazines.pickerCandidates.invalidate({
          slug: communitySlug,
        });
        void utils.magazines.availableArticles.invalidate({
          slug: communitySlug,
        });
      }
      const message = t(`done.${reviewStatus}`);
      setSuccess(message);
      setDeclineOpen(false);
      toast.success(message);
      router.push(communityMagazinePath(communitySlug));
      router.refresh();
    },
    onError: (cause) => {
      inFlight.current = false;
      setError(readEditorError(cause).key);
    },
  });
  const busy = review.isPending || success !== null;

  const decide = (decision: ReviewDecision, note?: string) => {
    if (busy || inFlight.current) return;
    const trimmed = note?.trim();
    if (decision === "request_changes" && !trimmed) return;
    inFlight.current = true;
    setError(null);
    review.mutate({
      slug: communitySlug,
      articleId,
      decision,
      ...(trimmed ? { note: trimmed } : {}),
    });
  };

  const refusal = error && (
    <div className="flex flex-col items-start gap-2">
      <p
        ref={refusalRef}
        role="alert"
        tabIndex={-1}
        className="text-destructive text-sm"
      >
        {tErrors(error)}
      </p>
      {error === "articleNotPending" && (
        <Button
          type="button"
          variant="outline"
          onClick={() => router.refresh()}
        >
          {t("reload")}
        </Button>
      )}
    </div>
  );

  return (
    <section
      aria-labelledby={`${id}-heading`}
      aria-busy={review.isPending}
      className="flex min-w-0 flex-col gap-4 rounded-xl border p-4 sm:p-6"
    >
      <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">
        {t("decision")}
      </h2>
      <p role="status" className="sr-only">
        {success}
      </p>
      {!declineOpen && refusal}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          aria-disabled={busy}
          onClick={() => decide("approve")}
        >
          {t("approve")}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-disabled={busy}
          aria-expanded={changesOpen}
          aria-controls={`${id}-changes`}
          onClick={() => {
            if (!busy && !inFlight.current) setChangesOpen((open) => !open);
          }}
        >
          {t("askChanges")}
        </Button>
        <AlertDialog
          open={declineOpen}
          onOpenChange={(open) => {
            if (!busy && !inFlight.current) setDeclineOpen(open);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              aria-disabled={busy}
              onClick={(event) => {
                if (busy || inFlight.current) event.preventDefault();
              }}
            >
              {t("decline")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("declineTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("declineBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="text-sm font-medium break-words">{articleTitle}</p>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={`${id}-decline-note`} className="leading-normal">
                {t("declineNoteLabel")}
              </Label>
              <Textarea
                id={`${id}-decline-note`}
                aria-describedby={`${id}-decline-count`}
                value={declineNote}
                onChange={(event) => {
                  if (!busy) setDeclineNote(event.target.value);
                }}
                maxLength={REVIEW_NOTE_MAX}
                aria-disabled={busy}
                readOnly={busy}
              />
              <p
                id={`${id}-decline-count`}
                className="text-muted-foreground text-right font-mono text-xs"
              >
                {declineNote.length} / {REVIEW_NOTE_MAX}
              </p>
            </div>
            {declineOpen && refusal}
            <AlertDialogFooter>
              <AlertDialogCancel
                aria-disabled={busy}
                onClick={(event) => {
                  if (busy || inFlight.current) event.preventDefault();
                }}
              >
                {t("cancel")}
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                aria-disabled={busy}
                onClick={() => decide("reject", declineNote)}
              >
                {t("declineConfirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div id={`${id}-changes`} hidden={!changesOpen}>
        {changesOpen && (
          <form
            className="flex min-w-0 flex-col items-start gap-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              decide("request_changes", changesNote);
            }}
          >
            <Label htmlFor={`${id}-changes-note`}>{t("changesLabel")}</Label>
            <Textarea
              ref={changesRef}
              id={`${id}-changes-note`}
              aria-describedby={`${id}-changes-count`}
              value={changesNote}
              onChange={(event) => {
                if (!busy) setChangesNote(event.target.value);
              }}
              required
              maxLength={REVIEW_NOTE_MAX}
              aria-disabled={busy}
              readOnly={busy}
            />
            <p
              id={`${id}-changes-count`}
              className="text-muted-foreground self-end font-mono text-xs"
            >
              {changesNote.length} / {REVIEW_NOTE_MAX}
            </p>
            <Button
              type="submit"
              variant="ink"
              className="h-auto min-h-9 max-w-full whitespace-normal"
              disabled={!changesNote.trim()}
              aria-disabled={busy || !changesNote.trim()}
            >
              {t("sendChanges")}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
