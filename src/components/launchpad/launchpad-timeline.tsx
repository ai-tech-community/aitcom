"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

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
        <h2 className="font-mono text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
          {t("timeline")}
        </h2>
        {isAuthor && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded border border-zinc-200 px-2 py-1 font-mono text-[9px] font-semibold tracking-wider text-zinc-500 uppercase transition-colors hover:bg-zinc-100"
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
          className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
        >
          <div>
            <label className="mb-1 block font-mono text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">
              {t("title")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              maxLength={500}
              required
              className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-300 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">
              {t("content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("contentPlaceholder")}
              maxLength={10000}
              rows={3}
              required
              className="w-full resize-none rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-300 focus:outline-none"
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
              className="rounded border border-zinc-200 px-3 py-1 font-mono text-[9px] font-semibold tracking-wider text-zinc-500 uppercase transition-colors hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                postUpdateMutation.isPending || !title.trim() || !content.trim()
              }
              className="rounded-md bg-zinc-900 px-3 py-1 font-mono text-[9px] font-semibold tracking-widest text-white uppercase transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {postUpdateMutation.isPending ? "Posting..." : t("submit")}
            </button>
          </div>
        </form>
      )}

      {/* Updates list (reverse chronological order) */}
      {updates.length === 0 ? (
        <p className="py-4 text-center font-mono text-[10px] text-zinc-400">
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
                className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug font-semibold text-zinc-900">
                    {update.title}
                  </p>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                    {timeAgo(update.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">
                  {update.content}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
