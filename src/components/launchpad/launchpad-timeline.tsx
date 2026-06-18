"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LaunchpadTimelineProps = {
  projectId: number;
  updates: Array<{
    id: string;
    title: string;
    content: string;
    createdAt: Date;
  }>;
  isAuthor: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LaunchpadTimeline({
  projectId,
  updates,
  isAuthor,
}: LaunchpadTimelineProps) {
  const t = useTranslations("launchpad.update");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const utils = api.useUtils();

  const postUpdateMutation = api.launchpad.postUpdate.useMutation({
    onSuccess: () => {
      setTitle("");
      setContent("");
      setShowForm(false);
      void utils.launchpad.getBySlug.invalidate();
      toast.success("Update posted!");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <SectionLabel bordered={false}>{t("timeline")}</SectionLabel>
        {isAuthor && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded border border-border px-2 py-1 font-mono text-[9px] font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:bg-accent"
          >
            {t("submit")}
          </button>
        )}
      </div>

      {/* Inline post update form */}
      {isAuthor && showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !content.trim()) return;
            postUpdateMutation.mutate({
              projectId,
              title: title.trim(),
              content: content.trim(),
            });
          }}
          className="space-y-2 rounded-lg border border-border bg-muted p-3"
        >
          <div>
            <label className="mb-1 block font-mono text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t("title")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              maxLength={500}
              required
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t("content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("contentPlaceholder")}
              maxLength={10000}
              rows={3}
              required
              className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setTitle("");
                setContent("");
              }}
              className="rounded border border-border px-3 py-1 font-mono text-[9px] font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                postUpdateMutation.isPending || !title.trim() || !content.trim()
              }
              className="rounded-md bg-foreground px-3 py-1 font-mono text-[9px] font-semibold tracking-widest text-background uppercase transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {postUpdateMutation.isPending ? "Posting..." : t("submit")}
            </button>
          </div>
        </form>
      )}

      {/* Updates list (reverse chronological order) */}
      {updates.length === 0 ? (
        <p className="py-4 text-center font-mono text-[10px] text-muted-foreground">
          {t("noUpdates")}
        </p>
      ) : (
        <div className="space-y-3">
          {[...updates]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .map((update) => (
              <div
                key={update.id}
                className="rounded-lg border border-border bg-muted p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug font-semibold text-foreground">
                    {update.title}
                  </p>
                  <RelativeTime
                    date={update.createdAt}
                    className="shrink-0 text-[9px] text-muted-foreground"
                  />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                  {update.content}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
