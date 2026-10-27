"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnsavedChangesGuard } from "@/components/use-autosave";
import { createVersionedWriter } from "@/components/versioned-writer";
import {
  isMembersOnlyView,
  type EditorItemView,
  type ItemProblem,
} from "@/lib/magazines/item-views";
import { issuePath } from "@/lib/magazines/paths";
import {
  type IssueVisibility,
  MAGAZINE_SLUG_PATTERN,
} from "@/lib/magazines/values";
import { effectiveVisibility } from "@/lib/magazines/visibility";
import type { MagazineIssue } from "@/payload-types";
import type { CommunityVisibility } from "@/server/communities/content-visibility";
import type { IssueItemInput } from "@/server/magazines/items/registry";
import { api, type RouterOutputs } from "@/trpc/react";

import { isUnavailableItem } from "../../items/registry";
import { editorErrorKey, readEditorError } from "../editor-errors";
import { publicOptInRequired } from "../public-opt-in";
import { AddItemsPanel } from "./add-items-panel";
import { BuilderTopBar } from "./builder-top-bar";
import { ISSUE_TITLE_MAX, IssueDetails } from "./issue-details";
import type { ItemRowView } from "./item-row";
import { ItemDetailsPanel } from "./item-details-panel";
import {
  builderKindLabelKey,
  builderOpenLabelKey,
  builderReferenceKey,
  builderRowTitle,
  hasBuilderItemEditor,
} from "./items/registry";
import type { AddedContent } from "./items/types";
import { ItemsList } from "./items-list";
import {
  addItem,
  type BuilderItem,
  isSavableItem,
  moveItem,
  newItemKey,
  publishBlockers,
  removeItem,
  toBuilderItems,
} from "./items-model";
import { LivePreview } from "./live-preview";
import { PublishDialog } from "./publish-dialog";
import {
  hasUnsavedWork,
  type IssueDetailsDraft,
  isIssueConflict,
  type IssueDetailsSave,
  type IssueSaveFailure,
  type IssueSaveValue,
  useIssueSave,
} from "./use-issue-save";

type EditingData = RouterOutputs["magazines"]["getIssueForEditing"];

const SLUG_MIN = 3;
const SLUG_MAX = 60;

function detailsOf(issue: MagazineIssue): IssueDetailsDraft {
  return {
    title: issue.title,
    slug: issue.slug,
    coverImageUrl: issue.coverImageUrl ?? null,
    editorNote: issue.editorNote ?? null,
    visibility: issue.visibility,
  };
}

/**
 * The issue's details as the server holds them, as a save baseline: the
 * opt-in counts as given only when the issue records a confirmation.
 */
function savedDetailsOf(
  issue: MagazineIssue,
  communityIsPrivate: boolean,
): IssueDetailsSave {
  return {
    ...detailsOf(issue),
    publicConfirmed:
      communityIsPrivate &&
      issue.visibility === "public" &&
      Boolean(issue.publicConfirmedAt),
  };
}

function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    MAGAZINE_SLUG_PATTERN.test(slug)
  );
}

/**
 * Who will be able to read the issue once the working copy is saved: its
 * effective visibility (ruling F10), never the stored value alone. In an
 * unlisted community an unconfirmed `public` issue is members-only; a
 * ticked opt-in counts, because the save records the confirmation.
 */
function audienceOf(
  details: IssueDetailsSave,
  issue: MagazineIssue,
  community: CommunityVisibility,
): IssueVisibility {
  const confirmedAt = issue.publicConfirmedAt ?? null;
  return effectiveVisibility(
    {
      visibility: details.visibility,
      publicConfirmedAt: details.publicConfirmed
        ? (confirmedAt ?? "on-save")
        : confirmedAt,
    },
    community,
  );
}

function BuilderSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-hidden="true">
      <Skeleton className="h-10" />
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

/**
 * The issue builder (mockup screen 4): a full-screen workspace to put an
 * issue together and publish it. Loads the issue once; "Reload" after a
 * conflict loads it again and starts a fresh working copy.
 */
export function IssueBuilder({
  communitySlug,
  issueId,
}: {
  communitySlug: string;
  issueId: number;
}) {
  const t = useTranslations("magazineEditor.builder");
  const query = api.magazines.getIssueForEditing.useQuery(
    { slug: communitySlug, issueId },
    {
      // The working copy is the editor's; only an explicit reload replaces it.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  if (query.isLoading) return <BuilderSkeleton />;
  if (query.isError || !query.data) {
    return (
      <div className="p-6">
        <ErrorState
          title={t("loadFailed")}
          retryLabel={t("tryAgain")}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <IssueWorkspace
      key={query.dataUpdatedAt}
      data={query.data}
      communitySlug={communitySlug}
      issueId={issueId}
      onReload={() => void query.refetch()}
    />
  );
}

/** The builder's working copy, made once from what the issue loaded with. */
function initialStateOf(data: EditingData) {
  const items = toBuilderItems(data.storedItems);
  const keyAt = (index: number) => items[index]?.key;
  const savedViews = new Map<string, EditorItemView>();
  data.items.forEach((view, index) => {
    const key = keyAt(index);
    if (key) savedViews.set(key, view);
  });
  const problems = new Map<string, ItemProblem["code"]>();
  for (const problem of data.problems) {
    const key = keyAt(problem.itemIndex);
    if (key && !problems.has(key)) problems.set(key, problem.code);
  }
  return {
    details: detailsOf(data.issue),
    items,
    savedViews,
    problems,
  };
}

function IssueWorkspace({
  data,
  communitySlug,
  issueId,
  onReload,
}: {
  data: EditingData;
  communitySlug: string;
  issueId: number;
  onReload: () => void;
}) {
  const t = useTranslations("magazineEditor.builder");
  const tItems = useTranslations("magazineEditor.builder.items");
  const tPublish = useTranslations("magazineEditor.builder.publishDialog");
  const tErrors = useTranslations("magazineEditor.errors");

  const utils = api.useUtils();
  const [initial] = useState(() => initialStateOf(data));
  // Every write to this issue (details, items, publish) shares one version.
  const [writer] = useState(() => createVersionedWriter(data.issue.updatedAt));

  /** The issue as the server last returned it. */
  const [issue, setIssue] = useState<MagazineIssue>(data.issue);
  const [details, setDetails] = useState<IssueDetailsDraft>(initial.details);
  const [items, setItems] = useState<BuilderItem[]>(initial.items);
  const [savedViews, setSavedViews] = useState(initial.savedViews);
  /** Problem codes the issue loaded with, by item key (preflight F7). */
  const [problems, setProblems] = useState(initial.problems);
  /** Names items were added with (an article's title), until a save names them. */
  const [titleHints, setTitleHints] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  /** Where the viewer edits content the issue references, by reference. */
  const [editHrefs, setEditHrefs] = useState<ReadonlyMap<string, string>>(
    () => new Map(Object.entries(data.openHrefs)),
  );
  const [failure, setFailure] = useState<IssueSaveFailure | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /**
   * Text sections added here that have never had text yet. While one is
   * open in its editor its row stays quiet: "write something" is not an
   * error before the editor had a chance to. Once it had text it counts as
   * written, so emptying it again is reported. (Content, not change events,
   * decides: a rich-text editor also reports a mere click into it.)
   */
  const [untouched, setUntouched] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** The item editor that takes focus once it renders (a section just added). */
  const focusEditorOf = useRef<string | null>(null);
  const editorPanel = useRef<HTMLDivElement>(null);
  const rowEditButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusRowAfterDone = useRef<string | null>(null);
  const pendingAdds = useRef(new Map<string, AddedContent>());
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const published = issue.status === "published";
  const titleValid =
    details.title.trim().length > 0 &&
    details.title.trim().length <= ISSUE_TITLE_MAX;
  const slugValid = published || isValidSlug(details.slug);
  const optInRequired = publicOptInRequired({
    next: details.visibility,
    saved: {
      visibility: issue.visibility,
      publicConfirmedBy: issue.publicConfirmedBy ?? null,
      publicConfirmedAt: issue.publicConfirmedAt ?? null,
    },
    community: data.community,
  });
  const optInPending = optInRequired && !confirmed;

  // What can be saved now; the rest stays as unsaved work until it can.
  const communityIsPrivate = data.communityIsPrivate;
  const savable: IssueSaveValue = useMemo(() => {
    const visibility = optInPending ? issue.visibility : details.visibility;
    return {
      details: {
        title: titleValid ? details.title.trim() : issue.title,
        slug: slugValid ? details.slug : issue.slug,
        coverImageUrl: details.coverImageUrl,
        editorNote: details.editorNote,
        visibility,
        // Ticking the box is a change of its own: it saves even when the
        // issue was `public` already, so the server records the opt-in.
        publicConfirmed:
          communityIsPrivate && visibility === "public" && !optInPending,
      },
      items: items.filter(isSavableItem),
    };
  }, [
    details,
    items,
    issue,
    titleValid,
    slugValid,
    optInPending,
    communityIsPrivate,
  ]);
  const paused =
    !titleValid ||
    !slugValid ||
    optInPending ||
    savable.items.length !== items.length;

  const onDetailsSaved = useCallback(
    (saved: MagazineIssue) => setIssue(saved),
    [],
  );
  const onItemsSaved = useCallback(
    (saved: {
      issue: MagazineIssue;
      viewsByKey: Map<string, EditorItemView>;
    }) => {
      setIssue(saved.issue);
      setSavedViews(saved.viewsByKey);
      // The server checks every item on save: what it accepted is valid.
      setProblems(new Map());
      // Content taken out of the issue can be added again.
      void utils.magazines.pickerCandidates.invalidate({
        slug: communitySlug,
      });
    },
    [utils, communitySlug],
  );

  const autosave = useIssueSave({
    communitySlug,
    issueId,
    writer,
    initial: {
      details: savedDetailsOf(data.issue, communityIsPrivate),
      items: initial.items,
    },
    value: savable,
    enabled: true,
    onDetailsSaved,
    onItemsSaved,
    onFailed: setFailure,
  });

  const unsaved = hasUnsavedWork(autosave.status, paused);
  useUnsavedChangesGuard(unsaved);

  // ── Item edits ──────────────────────────────────────────────────────────

  const handleAdd = (input: IssueItemInput, added: AddedContent) => {
    const key = newItemKey();
    pendingAdds.current.set(key, added);
    setItems((current) => addItem(current, input, key));
  };

  // Apply titles and focus only for additions accepted by the current list.
  // The functional list update handles removals and duplicate clicks in one tick.
  useEffect(() => {
    const additions = pendingAdds.current;
    if (additions.size === 0) return;
    pendingAdds.current = new Map();
    for (const item of items) {
      const added = additions.get(item.key);
      if (!added) continue;
      const { title, openHref } = added;
      if (title !== null) {
        setTitleHints((hints) => new Map(hints).set(item.key, title));
      }
      const reference = builderReferenceKey(item);
      if (openHref && reference !== null) {
        setEditHrefs((hrefs) => new Map(hrefs).set(reference, openHref));
      }
      if (!hasBuilderItemEditor(item)) continue;
      setEditingKey(item.key);
      if (!isSavableItem(item)) {
        setUntouched((keys) => new Set(keys).add(item.key));
      }
      focusEditorOf.current = item.key;
    }
  }, [items]);

  useEffect(() => {
    const closingKey = focusRowAfterDone.current;
    if (editingKey !== null || closingKey === null) return;
    focusRowAfterDone.current = null;
    rowEditButtons.current.get(closingKey)?.focus();
  }, [editingKey]);

  // Move focus into an item editor that was opened for a new item, on the
  // editor's first field, whatever kind of item it is.
  useEffect(() => {
    if (editingKey === null || focusEditorOf.current !== editingKey) return;
    focusEditorOf.current = null;
    const panel = editorPanel.current;
    const preferred = panel?.querySelector<HTMLElement>("[data-autofocus]");
    const fallback = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
    );
    (preferred ?? fallback)?.focus();
  }, [editingKey]);

  const handleRemove = (key: string) => {
    if (editingKey === key) setEditingKey(null);
    setItems((current) => removeItem(current, key));
  };

  const updateItem = (key: string, patch: Partial<BuilderItem>) => {
    const current = items.find((item) => item.key === key);
    const updated = current && ({ ...current, ...patch } as BuilderItem);
    if (updated && untouched.has(key) && isSavableItem(updated)) {
      setUntouched((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
    }
    setItems((all) =>
      all.map((item) =>
        item.key === key ? ({ ...item, ...patch } as BuilderItem) : item,
      ),
    );
  };

  // ── Rows ────────────────────────────────────────────────────────────────

  const failureMessage = (() => {
    if (!failure || autosave.status === "conflict") return null;
    return tErrors(readEditorError(failure.error).key);
  })();

  const rows: ItemRowView[] = items.map((item) => {
    const view = savedViews.get(item.key);
    const loadedProblem = problems.get(item.key);
    const highlighted = failure?.itemKey === item.key;
    const beingStarted = untouched.has(item.key) && editingKey === item.key;
    const problem = highlighted
      ? failureMessage
      : !isSavableItem(item)
        ? beingStarted
          ? null
          : tItems("unfinished")
        : loadedProblem
          ? tErrors(editorErrorKey(loadedProblem))
          : null;
    const reference = builderReferenceKey(item);
    const openHref = reference === null ? undefined : editHrefs.get(reference);
    const openLabelKey = builderOpenLabelKey(item);
    return {
      key: item.key,
      title: builderRowTitle(item, {
        saved: view,
        titleHint: titleHints.get(item.key),
        t: tItems,
      }),
      kindLabel: tItems(builderKindLabelKey(item)),
      unavailable: view !== undefined && "unavailable" in view,
      membersOnly: view !== undefined && isMembersOnlyView(view),
      problem,
      highlighted,
      selected: editingKey === item.key,
      onEdit: () => setEditingKey((k) => (k === item.key ? null : item.key)),
      editButtonRef: (button: HTMLButtonElement | null) => {
        if (button) rowEditButtons.current.set(item.key, button);
        else rowEditButtons.current.delete(item.key);
      },
      open:
        openHref && openLabelKey
          ? { href: openHref, label: tItems(openLabelKey) }
          : undefined,
    };
  });

  const editing = items.find((item) => item.key === editingKey);

  /** What the issue already references, so "Add more" does not offer it. */
  const referencesInIssue = useMemo(
    () =>
      new Set(
        items.flatMap((item) => {
          const reference = builderReferenceKey(item);
          return reference === null ? [] : [reference];
        }),
      ),
    [items],
  );

  // ── Publish ─────────────────────────────────────────────────────────────

  // Loaded problems of items still in the issue, at their current position.
  const currentProblems: ItemProblem[] = items.flatMap((item, itemIndex) => {
    const code = problems.get(item.key);
    return code ? [{ itemIndex, code }] : [];
  });
  const blockers = publishBlockers({
    title: details.title,
    items,
    problems: currentProblems,
  });
  const audience = audienceOf(savable.details, issue, data.community);

  const { mutateAsync: publishIssue } =
    api.magazines.publishIssue.useMutation();

  const publish = async () => {
    setPublishError(null);
    const status = await autosave.flush();
    if (hasUnsavedWork(status, paused)) {
      setPublishError(tPublish("notSaved"));
      throw new Error("NOT_SAVED");
    }
    try {
      await writer.run(async (expectedUpdatedAt) => {
        const out = await publishIssue({
          slug: communitySlug,
          issueId,
          expectedUpdatedAt,
        });
        setIssue(out);
        return out.updatedAt;
      });
    } catch (error) {
      // Someone else changed the issue first: the builder's one conflict
      // state (reload banner, saving stopped, Publish off), the same as an
      // autosave that hit it. It is fixed by reloading, not in the dialog,
      // so the dialog closes to bring the banner into view.
      if (isIssueConflict(error)) {
        autosave.markConflict();
        setPublishOpen(false);
        throw error;
      }
      const { key, itemIndex } = readEditorError(error);
      setPublishError(tErrors(key));
      if (itemIndex !== null) {
        setFailure({ error, itemKey: autosave.savedItemKeyAt(itemIndex) });
      }
      throw error;
    }
  };

  const displayStatus =
    paused && (autosave.status === "saved" || autosave.status === "idle")
      ? "dirty"
      : autosave.status;

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
      <BuilderTopBar
        communitySlug={communitySlug}
        magazineName={data.magazine.name}
        issueNumber={Number(issue.number)}
        status={issue.status}
        title={details.title}
        saveStatus={displayStatus}
        saveError={failure?.itemKey ? null : failureMessage}
        onRetry={() => void autosave.retry()}
        onReload={onReload}
        onPublish={() => {
          setPublishError(null);
          // The dialog points at the rows marked in the list: mark them all.
          setUntouched(new Set());
          setPublishOpen(true);
        }}
        publishDisabled={optInPending || autosave.status === "conflict"}
      />

      {/* Not <main>: the root layout already provides the main landmark. */}
      <section
        aria-label={t("workspaceLabel")}
        className="grid flex-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[24rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)_18rem]"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <IssueDetails
            details={details}
            onChange={(patch) => setDetails((d) => ({ ...d, ...patch }))}
            initialEditorNote={initial.details.editorNote}
            published={published}
            titleValid={titleValid}
            slugValid={slugValid}
            communityIsPrivate={data.communityIsPrivate}
            optInRequired={optInRequired}
            confirmed={confirmed}
            onConfirmedChange={setConfirmed}
          />
          <ItemsList
            rows={rows}
            onMove={(from, to) =>
              setItems((current) => moveItem(current, from, to))
            }
            onRemove={handleRemove}
          />
          {editing && (
            <div ref={editorPanel}>
              <ItemDetailsPanel
                item={editing}
                kindLabel={tItems(builderKindLabelKey(editing))}
                onChange={(patch) => updateItem(editing.key, patch)}
                onDone={() => {
                  focusRowAfterDone.current = editing.key;
                  setEditingKey(null);
                }}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 xl:row-span-1">
          <LivePreview
            magazine={data.magazine}
            community={data.community}
            issue={{
              number: Number(issue.number),
              publishedAt: issue.publishedAt ?? null,
            }}
            details={details}
            layout={issue.layout ?? "cover-story"}
            items={items}
            savedViews={savedViews}
            audience={audience}
          />
        </div>

        <aside className="min-w-0 lg:col-start-1 xl:col-start-3 xl:row-start-1">
          <AddItemsPanel
            communitySlug={communitySlug}
            referencesInIssue={referencesInIssue}
            onAdd={handleAdd}
          />
        </aside>
      </section>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        blockers={blockers}
        skippedCount={[...savedViews.values()].filter(isUnavailableItem).length}
        audience={audience}
        onConfirm={publish}
        error={publishError}
        readingHref={issuePath(data.magazine, { slug: issue.slug })}
      />
    </div>
  );
}
