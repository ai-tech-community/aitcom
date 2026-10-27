"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { issueBuilderPath } from "@/lib/magazines/paths";
import { api, type RouterOutputs } from "@/trpc/react";

import { readEditorError } from "../editor-errors";

type Outcome = RouterOutputs["magazines"]["makeAutoDraftNow"];

export function MakeDraftNow({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.autoDraft.makeNow");
  const tErrors = useTranslations("magazineEditor.errors");
  const utils = api.useUtils();
  const [result, setResult] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const make = api.magazines.makeAutoDraftNow.useMutation({
    onSuccess: (outcome) => {
      setResult(outcome);
      void utils.magazines.autoDraftHistory.invalidate({ slug });
      void utils.magazines.listIssues.invalidate({ slug });
    },
    onError: (err) => setError(tErrors(readEditorError(err).key)),
  });
  let message: string | null = null;
  let issueId: number | null = null;
  if (result) {
    switch (result.status) {
      case "made":
        message = t("made");
        issueId = result.issueId;
        break;
      case "skipped": {
        const reason = result.reason;
        switch (reason) {
          case "too_few":
            message = t("too_few", {
              found: result.found ?? 0,
              needed: result.needed ?? 0,
            });
            break;
          case "draft_open":
            message = t("draft_open");
            issueId = result.openIssueId;
            break;
          case "no_rights":
            message = t("no_rights");
            break;
          default: {
            const exhaustive: never = reason;
            return exhaustive;
          }
        }
        break;
      }
      case "busy":
      case "already_ran":
        message = t("busy");
        break;
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
  }
  return (
    <div className="space-y-3">
      <Button
        variant="ink"
        disabled={make.isPending}
        onClick={() => {
          setResult(null);
          setError(null);
          make.mutate({ slug });
        }}
      >
        {t("button")}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
          {issueId !== null && (
            <>
              {" "}
              <Link
                href={issueBuilderPath(slug, issueId)}
                className="font-medium underline underline-offset-4"
              >
                {t("open")}
              </Link>
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
