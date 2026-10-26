"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { EditorItemView } from "@/lib/magazines/item-views";
import { magazineArticlePath } from "@/lib/magazines/paths";
import type { IssueLayout, IssueVisibility } from "@/lib/magazines/values";
import { cn } from "@/lib/utils";

import { LAYOUTS } from "../../layouts/registry";
import { EditorNote, hasEditorNote } from "../../reading/issue-reader";
import type { BuilderItem } from "./items-model";
import type { IssueDetailsDraft } from "./use-issue-save";

type PreviewMode = "member" | "phone" | "visitor";

/**
 * The views the preview renders, in the builder's order (preflight F32):
 * an editorial block is derived from what the editor typed, so it shows at
 * once; an article shows its last saved view, so an article added a moment
 * ago appears after its first save. Unavailable markers show as they do
 * for editors on the reading page.
 */
export function previewViews(
  items: BuilderItem[],
  savedViews: ReadonlyMap<string, EditorItemView>,
): { views: EditorItemView[]; waiting: boolean } {
  const views: EditorItemView[] = [];
  let waiting = false;
  for (const item of items) {
    if (item.kind === "editorial") {
      views.push({
        kind: "editorial",
        itemId: item.key,
        intro: item.intro ?? null,
        heading: item.heading ?? null,
        body: item.body,
      });
      continue;
    }
    const saved = savedViews.get(item.key);
    if (saved) views.push({ ...saved, itemId: item.key });
    else waiting = true;
  }
  return { views, waiting };
}

/**
 * The live preview: the issue in its real layout (`LAYOUTS[layout]`), as a
 * member sees it, in a phone-sized frame, or as a visitor from outside the
 * community sees it (nothing for a members-only issue, the full issue for
 * a public one).
 */
export function LivePreview({
  magazine,
  details,
  layout,
  items,
  savedViews,
  audience,
}: {
  magazine: { name: string; slug: string };
  details: IssueDetailsDraft;
  layout: IssueLayout;
  items: BuilderItem[];
  savedViews: ReadonlyMap<string, EditorItemView>;
  /** Who will be able to read the issue (its effective visibility). */
  audience: IssueVisibility;
}) {
  const t = useTranslations("magazineEditor.builder.preview");
  const labelId = useId();
  const [mode, setMode] = useState<PreviewMode>("member");

  const Layout = LAYOUTS[layout];
  const { views, waiting } = previewViews(items, savedViews);
  const href = (articleSlug: string) =>
    magazineArticlePath(
      magazine,
      { slug: details.slug },
      { slug: articleSlug },
    );
  const showNote = hasEditorNote(details.editorNote);
  const hiddenFromVisitors = mode === "visitor" && audience === "members";

  return (
    <section aria-labelledby={labelId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel id={labelId} bordered={false}>
          {t("label")}
        </SectionLabel>
        <SegmentedControl<PreviewMode>
          size="sm"
          aria-label={t("mode")}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "member", label: t("member") },
            { value: "phone", label: t("phone") },
            { value: "visitor", label: t("visitor") },
          ]}
        />
      </div>

      <div
        data-testid="issue-preview"
        className={cn(
          "bg-background rounded-xl border",
          mode === "phone" ? "mx-auto w-full max-w-[390px] p-4" : "p-4 sm:p-6",
        )}
      >
        {hiddenFromVisitors ? (
          <EmptyState
            title={t("visitorNothingTitle")}
            description={t("visitorNothing")}
          />
        ) : (
          <div className="@container flex flex-col gap-6">
            <header className="flex items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="font-semibold tracking-tight">{magazine.name}</p>
                <p className="text-2xl leading-tight font-semibold tracking-tight text-balance break-words @xl:text-3xl">
                  {details.title.trim() || t("untitled")}
                </p>
              </div>
              {details.coverImageUrl && (
                // Any host an editor links to: next/image only serves listed hosts.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={details.coverImageUrl}
                  alt={details.title}
                  className="bg-secondary aspect-[3/4] w-24 shrink-0 rounded-md border object-cover @xl:w-32"
                />
              )}
            </header>
            <Layout
              items={views}
              href={href}
              editorNote={
                showNote ? <EditorNote note={details.editorNote} /> : null
              }
            />
            {views.length === 0 && !waiting && (
              <p className="text-muted-foreground text-sm">{t("empty")}</p>
            )}
            {waiting && (
              <p className="text-muted-foreground text-sm">
                {t("unsavedArticles")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
