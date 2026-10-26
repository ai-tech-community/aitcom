"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { IssueVisibility } from "@/lib/magazines/values";

import { PublicOptIn } from "../public-opt-in";
import type { IssueDetailsDraft } from "./use-issue-save";

export const ISSUE_TITLE_MAX = 200;
const SLUG_MAX = 60;

/**
 * The issue's own fields: title, address (read-only once published), cover,
 * editor's note and who can read it, with the unlisted-community opt-in.
 * Everything here autosaves with the rest of the issue; a field the server
 * would refuse (blank title, bad address, a public choice still waiting for
 * the tick) says why and waits.
 */
export function IssueDetails({
  details,
  onChange,
  initialEditorNote,
  published,
  titleValid,
  slugValid,
  communityIsPrivate,
  optInRequired,
  confirmed,
  onConfirmedChange,
}: {
  details: IssueDetailsDraft;
  onChange: (patch: Partial<IssueDetailsDraft>) => void;
  /** The note the editor starts from; the rich-text editor owns it after. */
  initialEditorNote: unknown;
  published: boolean;
  titleValid: boolean;
  slugValid: boolean;
  communityIsPrivate: boolean;
  /** `publicOptInRequired` for the chosen visibility. */
  optInRequired: boolean;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}) {
  const t = useTranslations("magazineEditor.builder.details");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const titleId = useId();
  const titleErrorId = useId();
  const slugId = useId();
  const slugHintId = useId();
  const coverId = useId();
  const coverHintId = useId();
  const noteLabelId = useId();
  const noteHintId = useId();

  const showSlugError = !published && !slugValid;

  const handleVisibility = (next: IssueVisibility) => {
    onChange({ visibility: next });
    // Leaving `public` withdraws the tick: coming back asks again.
    if (next !== "public") onConfirmedChange(false);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", details.title || "issue cover");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = (await res.json()) as { url: string };
      onChange({ coverImageUrl: json.url });
    } catch {
      toast.error(t("coverFailed"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section
      aria-labelledby={`${titleId}-section`}
      className="flex flex-col gap-5"
    >
      <SectionLabel id={`${titleId}-section`}>{t("label")}</SectionLabel>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>{t("title")}</Label>
        <Input
          id={titleId}
          value={details.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={ISSUE_TITLE_MAX}
          aria-invalid={!titleValid || undefined}
          aria-describedby={titleValid ? undefined : titleErrorId}
        />
        {!titleValid && (
          <p id={titleErrorId} className="text-destructive text-sm">
            {t("titleRequired")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={slugId}>{t("slug")}</Label>
        <Input
          id={slugId}
          value={details.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          readOnly={published}
          maxLength={SLUG_MAX}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={showSlugError || undefined}
          aria-describedby={slugHintId}
          className="font-mono"
        />
        <p
          id={slugHintId}
          className={
            showSlugError
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {published
            ? t("slugLocked")
            : showSlugError
              ? t("slugInvalid")
              : t("slugHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={coverId}>{t("cover")}</Label>
        <div className="flex flex-wrap items-center gap-3">
          {details.coverImageUrl && (
            // Any host an editor links to: next/image only serves listed hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={details.coverImageUrl}
              alt={details.title}
              className="bg-secondary aspect-[3/4] w-16 rounded-md border object-cover"
            />
          )}
          <input
            ref={fileInputRef}
            id={coverId}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-describedby={coverHintId}
            onChange={(e) => void handleCoverUpload(e)}
            disabled={isUploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading
              ? t("coverUploading")
              : details.coverImageUrl
                ? t("coverReplace")
                : t("coverUpload")}
          </Button>
          {details.coverImageUrl && !isUploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ coverImageUrl: null })}
            >
              {t("coverRemove")}
            </Button>
          )}
        </div>
        <p id={coverHintId} className="text-muted-foreground text-sm">
          {t("coverHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* Names the writing surface itself (its textbox), not a wrapper. */}
        <p id={noteLabelId} className="text-sm leading-none font-medium">
          {t("editorNote")}
        </p>
        <RichTextEditor
          initialValue={initialEditorNote}
          onChange={(state) => onChange({ editorNote: state })}
          contentClassName="min-h-24"
          ariaLabelledBy={noteLabelId}
          ariaDescribedBy={noteHintId}
        />
        <p id={noteHintId} className="text-muted-foreground text-sm">
          {t("editorNoteHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-none font-medium">{t("visibility")}</p>
        <SegmentedControl<IssueVisibility>
          aria-label={t("visibility")}
          value={details.visibility}
          onValueChange={handleVisibility}
          className="self-start"
          options={[
            { value: "members", label: t("visibilityMembers") },
            { value: "public", label: t("visibilityPublic") },
          ]}
        />
        {optInRequired && (
          <>
            <PublicOptIn
              communityIsPrivate={communityIsPrivate}
              value={details.visibility}
              confirmed={confirmed}
              onConfirmedChange={onConfirmedChange}
            />
            {!confirmed && (
              <p className="text-muted-foreground text-sm">
                {t("optInPending")}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
