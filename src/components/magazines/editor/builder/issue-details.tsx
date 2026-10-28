"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ISSUE_LAYOUTS,
  type IssueLayout,
  type IssueVisibility,
} from "@/lib/magazines/values";
import { shouldWithdrawVisibilityConfirmation } from "@/lib/magazines/visibility";

import { ImageUploadField } from "../image-upload-field";
import { PublicOptIn } from "../public-opt-in";
import type { IssueDetailsDraft } from "./use-issue-save";

export const ISSUE_TITLE_MAX = 200;
const SLUG_MAX = 60;

const LAYOUT_LABELS = {
  "cover-story": "layouts.cover-story",
  "long-read": "layouts.long-read",
  digest: "layouts.digest",
} as const satisfies Record<IssueLayout, string>;

const LAYOUT_HINTS = {
  "cover-story": "layoutHints.cover-story",
  "long-read": "layoutHints.long-read",
  digest: "layoutHints.digest",
} as const satisfies Record<IssueLayout, string>;

const VISIBILITY_HINTS = {
  members: "visibilityHints.members",
  teaser: "visibilityHints.teaser",
  public: "visibilityHints.public",
} as const satisfies Record<IssueVisibility, string>;

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

  const titleId = useId();
  const titleErrorId = useId();
  const slugId = useId();
  const slugHintId = useId();
  const noteLabelId = useId();
  const noteHintId = useId();
  const layoutHintId = useId();

  const showSlugError = !published && !slugValid;

  const handleVisibility = (next: IssueVisibility) => {
    if (shouldWithdrawVisibilityConfirmation(details.visibility, next))
      onConfirmedChange(false);
    onChange({ visibility: next });
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

      <ImageUploadField
        value={details.coverImageUrl}
        onChange={(coverImageUrl) => onChange({ coverImageUrl })}
        uploadAlt={details.title || "issue cover"}
        text={{
          label: t("cover"),
          hint: t("coverHint"),
          upload: t("coverUpload"),
          replace: t("coverReplace"),
          remove: t("coverRemove"),
          uploading: t("coverUploading"),
          failed: t("coverFailed"),
        }}
        renderPreview={(url) => (
          // Any host an editor links to: next/image only serves listed hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="bg-secondary aspect-[3/4] w-16 rounded-md border object-cover"
          />
        )}
      />

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
        <p className="text-sm leading-none font-medium">{t("layout")}</p>
        <SegmentedControl<IssueLayout>
          aria-label={t("layout")}
          aria-describedby={layoutHintId}
          value={details.layout}
          onValueChange={(layout) => onChange({ layout })}
          className="h-auto flex-wrap self-start"
          options={ISSUE_LAYOUTS.map((value) => ({
            value,
            label: t(LAYOUT_LABELS[value]),
          }))}
        />
        <p
          id={layoutHintId}
          role="status"
          className="text-muted-foreground text-sm"
        >
          {t(LAYOUT_HINTS[details.layout])}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-none font-medium">{t("visibility")}</p>
        <SegmentedControl<IssueVisibility>
          aria-label={t("visibility")}
          value={details.visibility}
          onValueChange={handleVisibility}
          className="h-auto flex-wrap self-start"
          options={[
            { value: "members", label: t("visibilityMembers") },
            { value: "teaser", label: t("visibilityTeaser") },
            { value: "public", label: t("visibilityPublic") },
          ]}
        />
        <p role="status" className="text-muted-foreground text-sm">
          {t(VISIBILITY_HINTS[details.visibility])}
        </p>
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
