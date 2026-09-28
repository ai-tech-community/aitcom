"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { MaterialSummary } from "@/lib/classroom/material-access";
import {
  fileTypeLabel,
  formatBytes,
  isInlinePreviewable,
} from "@/lib/classroom/material-rules";
import { api } from "@/trpc/react";
import { FileTypeIcon } from "./file-type-icon";
import { useMaterialSummary } from "./materials-context";
import { startDownload } from "./start-download";

type PresentSummary = Exclude<MaterialSummary, { access: "removed" }>;

/**
 * Signed links stay identical for a 30-minute window and live about an hour
 * past it, so a preview link is not refetched sooner than this.
 */
const LINK_STALE_MS = 25 * 60 * 1000;

function DownloadButton({ materialId }: { materialId: number }) {
  const t = useTranslations("classroom.files");
  const utils = api.useUtils();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { url } = await utils.classroomMaterials.fileLink.fetch({
        materialId,
        disposition: "attachment",
      });
      startDownload(url);
    } catch {
      toast.error(t("downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={busy}
      onClick={() => void download()}
    >
      <Download className="size-4" />
      {t("download")}
    </Button>
  );
}

/**
 * The PDF shown in the lesson. The link is fetched only when the card
 * mounts. No `sandbox`: browsers refuse to render PDFs in sandboxed frames,
 * and the file is served from the S3 origin, never ours.
 */
function PdfPreview({
  materialId,
  title,
}: {
  materialId: number;
  title: string;
}) {
  const t = useTranslations("classroom.files");
  const link = api.classroomMaterials.fileLink.useQuery(
    { materialId, disposition: "inline" },
    { staleTime: LINK_STALE_MS, refetchOnWindowFocus: false },
  );
  if (!link.data) {
    return (
      <div
        className="border-border bg-muted/30 h-[70vh] min-h-[480px] border-t"
        aria-hidden="true"
      />
    );
  }
  return (
    <iframe
      src={link.data.url}
      title={t("previewTitle", { title })}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="border-border h-[70vh] min-h-[480px] w-full border-t"
    />
  );
}

/** What a card says instead of offering a download. */
const NOTE_KEYS: Record<
  Exclude<PresentSummary["access"], "download">,
  string
> = {
  join: "join",
  processing: "processing",
  failed: "failed",
};

/** A hosted file inside a lesson: flat, border-defined card (DESIGN.md). */
export function HostedFileCard({ materialId }: { materialId: number }) {
  const t = useTranslations("classroom.files");
  const summary = useMaterialSummary(materialId);

  if (summary.access === "removed") {
    return (
      <p className="border-border text-muted-foreground my-6 rounded-lg border border-dashed px-4 py-3 text-sm">
        {t("removed")}
      </p>
    );
  }

  return (
    <div className="border-border my-6 overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileTypeIcon
          extension={summary.extension}
          className="text-muted-foreground size-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{summary.title}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {`${fileTypeLabel(summary.extension)} · ${formatBytes(summary.bytes)}`}
          </p>
        </div>
        {summary.access === "download" ? (
          <DownloadButton materialId={materialId} />
        ) : (
          <p className="text-muted-foreground max-w-[50%] text-right text-sm">
            {t(NOTE_KEYS[summary.access])}
          </p>
        )}
      </div>
      {summary.access === "download" &&
      isInlinePreviewable(summary.extension) ? (
        <PdfPreview materialId={materialId} title={summary.title} />
      ) : null}
    </div>
  );
}
