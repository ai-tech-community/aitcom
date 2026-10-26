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
import { IssueHero } from "../../reading/issue-hero";
import { builderPreviewView } from "./items/registry";
import type { BuilderItem } from "./items-model";
import type { IssueDetailsDraft } from "./use-issue-save";

type PreviewMode = "member" | "phone" | "visitor";

/**
 * The views the preview renders, in the builder's order (preflight F32).
 * Each kind decides (`previewView`): an editorial block is derived from
 * what the editor typed, so it shows at once; an article shows its last
 * saved view, so an article added a moment ago appears after its first
 * save. Unavailable markers show as they do for editors on the reading
 * page.
 */
export function previewViews(
  items: BuilderItem[],
  savedViews: ReadonlyMap<string, EditorItemView>,
): { views: EditorItemView[]; waiting: boolean } {
  const views: EditorItemView[] = [];
  let waiting = false;
  for (const item of items) {
    const view = builderPreviewView(item, savedViews.get(item.key));
    if (view) views.push(view);
    else waiting = true;
  }
  return { views, waiting };
}

/**
 * The live preview: the issue's hero and its real layout
 * (`LAYOUTS[layout]`), as a member sees it, in a phone-sized frame, or as a
 * visitor from outside the community sees it (nothing for a members-only
 * issue, the full issue for a public one).
 *
 * The preview is a picture of the page, not the page: it is `inert`, so its
 * links and any control an item kind renders can be neither clicked nor
 * focused, and keyboard users go from the mode switch straight on. Inert
 * also takes it out of the accessibility tree; the item list says the same
 * in words. The note is unsigned here: an issue is signed by the editor who
 * publishes it.
 */
export function LivePreview({
  magazine,
  community,
  issue,
  details,
  layout,
  items,
  savedViews,
  audience,
}: {
  magazine: { name: string; slug: string };
  community: { name: string };
  /** The saved issue's number and publish date (null for a draft). */
  issue: { number: number; publishedAt: string | null };
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
          <div className="flex flex-col gap-6">
            <div inert className="@container flex flex-col gap-6">
              <IssueHero
                titleAs="h2"
                issue={{
                  number: issue.number,
                  title: details.title.trim() || t("untitled"),
                  coverImageUrl: details.coverImageUrl,
                  publishedAt: issue.publishedAt,
                  magazine,
                  community,
                  editorNote: details.editorNote,
                  signedBy: null,
                }}
              />
              <Layout items={views} href={href} />
            </div>
            {/* Outside the inert picture: these say what the preview is waiting for. */}
            {views.length === 0 && !waiting && (
              <p className="text-muted-foreground text-sm">{t("empty")}</p>
            )}
            {waiting && (
              <p className="text-muted-foreground text-sm">
                {t("unsavedItems")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
