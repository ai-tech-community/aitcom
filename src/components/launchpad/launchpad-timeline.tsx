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
      toast.success(t("toastPosted"));
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
            className="border-border text-muted-foreground hover:bg-accent rounded border px-2 py-1 font-mono text-xs font-semibold tracking-wider uppercase transition-colors"
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
          className="border-border bg-muted space-y-2 rounded-lg border p-3"
        >
          <div>
            <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
              {t("title")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              maxLength={500}
              required
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring w-full rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block font-mono text-xs font-semibold tracking-wider uppercase">
              {t("content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("contentPlaceholder")}
              maxLength={10000}
              rows={3}
              required
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring w-full resize-none rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
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
              className="border-border text-muted-foreground hover:bg-accent rounded border px-3 py-1 font-mono text-xs font-semibold tracking-wider uppercase transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                postUpdateMutation.isPending || !title.trim() || !content.trim()
              }
              className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3 py-1 font-mono text-xs font-semibold tracking-widest uppercase transition-colors disabled:opacity-50"
            >
              {postUpdateMutation.isPending ? "Posting..." : t("submit")}
            </button>
          </div>
        </form>
      )}

      {/* Updates list (reverse chronological order) */}
      {updates.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center font-mono text-xs">
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
                className="border-border bg-muted rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground text-sm leading-snug font-semibold">
                    {update.title}
                  </p>
                  <RelativeTime
                    date={update.createdAt}
                    className="text-muted-foreground shrink-0 text-xs"
                  />
                </div>
                <p className="text-foreground mt-1.5 text-sm leading-relaxed">
                  {update.content}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
