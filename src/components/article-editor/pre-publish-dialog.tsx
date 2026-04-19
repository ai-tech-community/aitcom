"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EditorAction } from "./types";

interface PrePublishDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  isTrustedAuthor: boolean;
  blockingChecks: string[];
  warningChecks: string[];
  outline: Array<{ tag: string; text: string }>;
  type: "article" | "tutorial";
  tags: string[];
  mediaUrl: string;
  tagInput: string;
  onTagInputChange: (value: string) => void;
  onAddTag: () => void;
  dispatch: React.Dispatch<EditorAction>;
}

const inputClass =
  "border-border bg-background w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary";

export function PrePublishDialog({
  open,
  onClose,
  onSubmit,
  submitting,
  isTrustedAuthor,
  blockingChecks,
  warningChecks,
  outline,
  type,
  tags,
  mediaUrl,
  tagInput,
  onTagInputChange,
  onAddTag,
  dispatch,
}: PrePublishDialogProps) {
  const t = useTranslations("articleEditor");
  const [featuredImageError, setFeaturedImageError] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="bg-background border-border mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{t("prePublishTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("prePublishSubtitle")}
        </p>

        {/* Readiness checks */}
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs tracking-wider">
            {t("readinessLabel").toUpperCase()}
          </p>
          <div className="space-y-1.5 text-sm">
            {blockingChecks.length === 0 && warningChecks.length === 0 ? (
              <p className="text-sm text-green-500">{t("allBlockingClear")}</p>
            ) : (
              <>
                {blockingChecks.map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="mt-0.5 text-red-400">✕</span>
                    <span className="text-red-400">{item}</span>
                  </div>
                ))}
                {warningChecks.map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="mt-0.5 text-orange-400">!</span>
                    <span className="text-orange-400">{item}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Outline */}
        <div className="mt-5">
          <p className="mb-2 font-mono text-xs tracking-wider">
            {t("outlineLabel").toUpperCase()}
          </p>
          {outline.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("outlineEmpty")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {outline.map((heading) => (
                <li
                  key={`${heading.tag}-${heading.text}`}
                  className={`text-muted-foreground ${heading.tag === "h3" ? "ml-4" : ""}`}
                >
                  <span className="font-mono text-xs">
                    {heading.tag.toUpperCase()}
                  </span>{" "}
                  {heading.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
              {t("type").toUpperCase()}
            </label>
            <select
              value={type}
              onChange={(e) =>
                dispatch({
                  type: "SET_ARTICLE_TYPE",
                  payload: e.target.value as "article" | "tutorial",
                })
              }
              className={inputClass}
            >
              <option value="article">{t("article")}</option>
              <option value="tutorial">{t("tutorial")}</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
              {t("tags").toUpperCase()}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="border-border text-muted-foreground flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: "REMOVE_TAG", payload: tag })
                    }
                    className="hover:text-foreground ml-0.5"
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => onTagInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddTag();
                  }
                }}
                placeholder={t("addTag")}
                className="border-border bg-background focus:ring-primary rounded-full border px-2.5 py-0.5 font-mono text-xs focus:ring-1 focus:outline-none"
              />
            </div>
          </div>

          {/* Featured image */}
          <div>
            <label className="text-muted-foreground mb-1 block font-mono text-xs tracking-wider">
              {t("featuredImage").toUpperCase()}
            </label>
            <input
              type="text"
              value={mediaUrl}
              onChange={(e) => {
                dispatch({
                  type: "SET_FIELD",
                  field: "mediaUrl",
                  payload: e.target.value,
                });
                setFeaturedImageError(false);
              }}
              placeholder="https://..."
              className={inputClass}
            />
            {mediaUrl && !featuredImageError ? (
              <div className="border-border mt-2 overflow-hidden rounded border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl}
                  alt={t("featuredImagePreview")}
                  className="h-32 w-full object-cover"
                  onError={() => setFeaturedImageError(true)}
                />
              </div>
            ) : (
              <div className="border-border mt-2 flex h-24 items-center justify-center rounded border-2 border-dashed">
                <span className="text-muted-foreground text-xs">
                  {t("featuredImagePlaceholder")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
          >
            {t("backToEditing")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || blockingChecks.length > 0}
            className="bg-foreground text-background hover:bg-foreground/90 rounded px-5 py-2 font-mono text-xs tracking-wider transition-colors disabled:opacity-50"
          >
            {submitting
              ? t("submitting").toUpperCase()
              : isTrustedAuthor
                ? t("publish").toUpperCase()
                : t("submitForReview").toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
