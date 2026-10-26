"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnsavedChangesGuard } from "@/components/use-autosave";
import { createVersionedWriter } from "@/components/versioned-writer";
import type { EditorItemView, ItemProblem } from "@/lib/magazines/item-views";
import { issuePath, magazineArticleEditPath } from "@/lib/magazines/paths";
import {
  type IssueVisibility,
  MAGAZINE_SLUG_PATTERN,
} from "@/lib/magazines/values";
import { effectiveVisibility } from "@/lib/magazines/visibility";
import type { MagazineIssue } from "@/payload-types";
import type { CommunityVisibility } from "@/server/communities/content-visibility";
import { api, type RouterOutputs } from "@/trpc/react";

import { editorErrorKey, readEditorError } from "../editor-errors";
import { publicOptInRequired } from "../public-opt-in";
import { type AddableArticle, AddItemsPanel } from "./add-items-panel";
import { BuilderTopBar } from "./builder-top-bar";
import { ISSUE_TITLE_MAX, IssueDetails } from "./issue-details";
import type { ItemRowView } from "./item-row";
import { articleReference } from "./items/article";
import {
  builderKindLabelKey,
  builderOpenLabelKey,
  builderReferenceKey,
  builderRowTitle,
  hasBuilderItemEditor,
  renderBuilderItemEditor,
} from "./items/registry";
import { ItemsList } from "./items-list";
import {
  addEditorial,
  addItem,
  type BuilderItem,
  isSavableItem,
  moveItem,
  publishBlockers,
  removeItem,
  toBuilderItems,
} from "./items-model";
import { LivePreview } from "./live-preview";
import { PublishDialog } from "./publish-dialog";
import {
  hasUnsavedWork,
  type IssueDetailsDraft,
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

/** Edit links of the issue's articles the viewer may open, by reference. */
function editHrefsOf(
  communitySlug: string,
  articles: readonly { id: number; slug: string }[],
): Map<string, string> {
  return new Map(
    articles.map((article) => [
      articleReference(article.id),
      magazineArticleEditPath(communitySlug, article.slug),
    ]),
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
  const [editHrefs, setEditHrefs] = useState<ReadonlyMap<string, string>>(() =>
    editHrefsOf(communitySlug, data.editableArticles),
  );
  const [failure, setFailure] = useState<IssueSaveFailure | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
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
      // Articles taken out of the issue are free again.
      void utils.magazines.availableArticles.invalidate({
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

  const handleAddArticle = (article: AddableArticle) => {
    const next = addItem(items, { kind: "article", articleId: article.id });
    const added = next.at(-1);
    if (next === items || !added) return;
    setItems(next);
    setTitleHints((hints) => new Map(hints).set(added.key, article.title));
    if (article.editableByViewer) {
      setEditHrefs((hrefs) =>
        new Map(hrefs).set(
          articleReference(article.id),
          magazineArticleEditPath(communitySlug, article.slug),
        ),
      );
    }
  };

  const handleAddEditorial = () => {
    const next = addEditorial(items);
    setItems(next);
    setEditingKey(next.at(-1)?.key ?? null);
  };

  const handleRemove = (key: string) => {
    if (editingKey === key) setEditingKey(null);
    setItems((current) => removeItem(current, key));
  };

  const updateItem = (key: string, patch: Partial<BuilderItem>) =>
    setItems((current) =>
      current.map((item) =>
        item.key === key ? ({ ...item, ...patch } as BuilderItem) : item,
      ),
    );

  // ── Rows ────────────────────────────────────────────────────────────────

  const failureMessage = (() => {
    if (!failure || autosave.status === "conflict") return null;
    return tErrors(readEditorError(failure.error).key);
  })();

  const rows: ItemRowView[] = items.map((item) => {
    const view = savedViews.get(item.key);
    const loadedProblem = problems.get(item.key);
    const highlighted = failure?.itemKey === item.key;
    const problem = highlighted
      ? failureMessage
      : !isSavableItem(item)
        ? tItems("unfinished")
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
      problem,
      highlighted,
      selected: editingKey === item.key,
      onEdit: hasBuilderItemEditor(item)
        ? () => setEditingKey((k) => (k === item.key ? null : item.key))
        : undefined,
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
          {editing &&
            renderBuilderItemEditor(editing, {
              onChange: (patch) =>
                updateItem(editing.key, patch as Partial<BuilderItem>),
              onDone: () => setEditingKey(null),
            })}
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 xl:row-span-1">
          <LivePreview
            magazine={data.magazine}
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
            onAddArticle={handleAddArticle}
            onAddEditorial={handleAddEditorial}
          />
        </aside>
      </section>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        blockers={blockers}
        audience={audience}
        onConfirm={publish}
        error={publishError}
        readingHref={issuePath(data.magazine, { slug: issue.slug })}
      />
    </div>
  );
}
