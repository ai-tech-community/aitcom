"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Image from "next/image";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Globe,
  Lock,
  Pencil,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LoadMoreQuery } from "@/components/ui/load-more";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { GalleryCategoryBadge } from "./gallery-category-badge";
import { useGalleryErrorText } from "./gallery-error-text";
import {
  formatClipLength,
  useGalleryItemLabel,
  useGalleryUploaderName,
} from "./gallery-item-text";
import { GalleryReportDialog } from "./gallery-report-dialog";
import { GalleryReviewBanner } from "./gallery-review-banner";
import { useOpening } from "./use-opening";

/** What a report or a restore changed for the viewer of the lightbox. */
export type GalleryItemChange = {
  /** The viewer may no longer see the item; the lightbox closes. */
  gone: boolean;
};

/** Keys that belong to the focused control, not to the lightbox. */
const OWNS_ARROW_KEYS = "video, audio, input, textarea, select, [role=slider]";

/**
 * The tile of an item: inside `scope` when one is given (the same item can
 * be on the page twice, as a pinned post and in the stream), else anywhere
 * in the page.
 */
function tileFor(
  itemId: number,
  scope: HTMLElement | null | undefined,
): HTMLElement | null {
  return (scope ?? document).querySelector<HTMLElement>(
    `[data-gallery-item-id="${itemId}"]`,
  );
}

/**
 * One gallery item, large, in a modal dialog: the photo or video on a dark
 * stage, previous/next by button and ←/→, Esc or Close to leave. Past the
 * last loaded item, Next loads the wall's next page (`more`) and carries
 * on; at either real end the button stays focusable but does nothing
 * (`aria-disabled`), so keyboard focus never falls out of the dialog.
 * Focus goes to Close on open and, on close, back to the tile of the item
 * last shown (`GalleryTile` marks tiles with `data-gallery-item-id`) —
 * looked for in `focusScope` when given, else in the whole page — or else
 * to `fallbackFocus`. The side panel says who added it, when, its caption,
 * event, category, audience, magazine permission and description.
 *
 * Actions: the uploader may edit (when `onEdit` is given) and delete;
 * moderators (`canModerate`) may delete anyone's item. Anyone signed in
 * (`signedIn`) may report an item they did not add that is not hidden;
 * guests are not offered Report at all, as on feed posts. A hidden item
 * shows its uploader why, and shows moderators the review (Restore or
 * Remove, which takes Delete's place). The server decides again on every
 * call.
 *
 * After a report, the reporter may no longer see the item unless they are
 * a moderator: the lightbox then closes as after a delete. A report or a
 * restore calls `onChanged`, a Remove calls `onDeleted`, so the caller
 * refreshes what it shows.
 *
 * Signed links change every window: images skip the optimizer and nothing
 * is keyed by URL.
 */
export function GalleryLightbox({
  slug,
  items,
  openId,
  onClose,
  onNavigate,
  onEdit,
  onDeleted,
  onChanged,
  canModerate = false,
  signedIn = false,
  fallbackFocus,
  focusScope,
  more,
}: {
  slug: string;
  /** The items prev/next move through, in wall order. */
  items: readonly GalleryItemView[];
  /** The open item; null (or an id not in `items`) closes the lightbox. */
  openId: number | null;
  onClose: () => void;
  onNavigate: (itemId: number) => void;
  onEdit?: (item: GalleryItemView) => void;
  /**
   * Called after a delete or a moderator's Remove succeeded, before the
   * lightbox closes.
   */
  onDeleted?: (itemId: number) => void;
  /** Called after a report or a restore went through. */
  onChanged?: (itemId: number, change: GalleryItemChange) => void;
  canModerate?: boolean;
  /** Whether the viewer is signed in, and so may report. */
  signedIn?: boolean;
  /** Where focus goes when no tile is left to return to. */
  fallbackFocus?: RefObject<HTMLElement | null>;
  /** Where the tiles to return focus to are; the whole page without it. */
  focusScope?: RefObject<HTMLElement | null>;
  /** The wall's paging, so Next can go past the last loaded item. */
  more?: LoadMoreQuery;
}) {
  const t = useTranslations("gallery.lightbox");
  const labelFor = useGalleryItemLabel();
  const uploaderName = useGalleryUploaderName();
  const errorText = useGalleryErrorText();
  const confirm = useConfirm();
  const closeRef = useRef<HTMLButtonElement>(null);

  const index =
    openId === null ? -1 : items.findIndex((each) => each.id === openId);
  const current = index >= 0 ? items[index] : undefined;
  // The dialog animates out after `openId` clears: keep showing the item
  // (state adjusted while rendering, React's "previous render" pattern).
  const [shown, setShown] = useState(current);
  if (current !== undefined && current !== shown) setShown(current);
  const item = current ?? shown;
  const previous = index > 0 ? items[index - 1] : undefined;
  const next = index >= 0 ? items[index + 1] : undefined;
  const canLoadMore = !next && current !== undefined && !!more?.hasNextPage;

  // Next at the last loaded item asks for the next page, then moves on to
  // the first new item once it arrives. Moving elsewhere or closing cancels
  // it, so a late page never reopens or redirects the lightbox; so does a
  // failed page, so Next is not left busy. A failure flagged from an earlier
  // try does not count: only one that ends the fetch seen since (`fetched`).
  const [advanceFrom, setAdvanceFrom] = useState<number | null>(null);
  const fetched = useRef(false);
  const fetching = !!more?.isFetchingNextPage;
  const fetchFailed = !!more?.isFetchNextPageError;
  useEffect(() => {
    if (advanceFrom === null) return;
    if (openId !== advanceFrom) {
      setAdvanceFrom(null);
      return;
    }
    const at = items.findIndex((each) => each.id === advanceFrom);
    const after = at >= 0 ? items[at + 1] : undefined;
    if (after) {
      setAdvanceFrom(null);
      onNavigate(after.id);
    } else if (at < 0 || !more?.hasNextPage) {
      setAdvanceFrom(null);
    } else if (fetching) {
      fetched.current = true;
    } else if (fetchFailed && fetched.current) {
      setAdvanceFrom(null);
    }
  }, [
    advanceFrom,
    openId,
    items,
    more?.hasNextPage,
    fetching,
    fetchFailed,
    onNavigate,
  ]);

  const goTo = (target: GalleryItemView | undefined) => {
    if (!target) return;
    setAdvanceFrom(null);
    onNavigate(target.id);
  };
  const goNext = () => {
    if (next) return goTo(next);
    if (!canLoadMore || !current || !more) return;
    fetched.current = more.isFetchingNextPage;
    setAdvanceFrom(current.id);
    if (!more.isFetchingNextPage) void more.fetchNextPage();
  };

  // After the item left the viewer's sight (deleted, removed, reported),
  // focus goes to a neighbour's tile instead of its own (or to
  // `fallbackFocus` when it was the last).
  const afterGone = useRef<{ neighbour: number | null } | null>(null);
  const markGone = () => {
    afterGone.current = { neighbour: (next ?? previous)?.id ?? null };
  };
  const deleted = (itemId: number) => {
    markGone();
    onDeleted?.(itemId);
    onClose();
  };
  const reported = (itemId: number) => {
    const gone = !canModerate;
    if (gone) markGone();
    onChanged?.(itemId, { gone });
    if (gone) onClose();
  };

  const [reporting, openReport, closeReport] = useOpening<{
    item: GalleryItemView;
  }>();

  const remove = api.gallery.deleteItem.useMutation({
    onSuccess: (_data, input) => {
      toast.success(t("deleted"));
      deleted(input.itemId);
    },
    onError: (error) => toast.error(errorText(error, "deleteFailed")),
  });

  if (!item) return null;

  const label = labelFor(item);
  const isVideo = item.mediaType === "video";
  const length =
    isVideo && item.durationSeconds !== null
      ? formatClipLength(item.durationSeconds)
      : null;
  const canEdit = item.isOwn && onEdit !== undefined;
  // On a hidden item a moderator has the review's Remove instead.
  const canDelete = item.isOwn || (canModerate && !item.hidden);
  const canReport = signedIn && !item.isOwn && !item.hidden;
  const showReview = item.hidden && (canModerate || item.isOwn);
  const caption = item.caption?.trim();
  const alt = item.alt?.trim() ?? "";

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if ((event.target as Element).closest?.(OWNS_ARROW_KEYS)) return;
    if (event.key === "ArrowLeft" && previous) {
      event.preventDefault();
      goTo(previous);
    } else if (event.key === "ArrowRight" && (next || canLoadMore)) {
      event.preventDefault();
      goNext();
    }
  };

  const askToDelete = async () => {
    const ok = await confirm({
      title: isVideo ? t("deleteVideoTitle") : t("deletePhotoTitle"),
      description: t("deleteBody"),
      confirmLabel: t("deleteConfirm"),
      destructive: true,
    });
    if (ok) remove.mutate({ slug, itemId: item.id });
  };

  return (
    <>
      <Dialog
        open={current !== undefined}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const gone = afterGone.current;
            afterGone.current = null;
            const scope = focusScope?.current;
            const target = gone
              ? ((gone.neighbour === null
                  ? null
                  : tileFor(gone.neighbour, scope)) ??
                fallbackFocus?.current ??
                null)
              : (tileFor(item.id, scope) ?? fallbackFocus?.current ?? null);
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
          className="top-0 left-0 grid h-dvh w-full max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)_auto] gap-0 rounded-none border-0 bg-black/90 p-0 shadow-none sm:max-w-none lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:grid-rows-1"
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>

          <div className="relative flex min-h-0 items-center justify-center px-14 pt-14 pb-6 lg:py-12">
            {isVideo ? (
              <video
                key={item.id}
                src={item.url}
                poster={item.thumbnailUrl}
                controls
                playsInline
                preload="metadata"
                aria-label={label}
                className="max-h-full max-w-full rounded-md"
              />
            ) : (
              <Image
                key={item.id}
                src={item.url}
                alt={alt !== "" ? alt : label}
                width={item.width}
                height={item.height}
                unoptimized
                className="h-auto max-h-full w-auto max-w-full rounded-md object-contain"
              />
            )}

            <StageButton
              label={t("previous")}
              unavailable={!previous}
              onClick={() => goTo(previous)}
              className="left-2"
            >
              <ChevronLeft />
            </StageButton>
            <StageButton
              label={t("next")}
              unavailable={!next && !canLoadMore}
              busy={advanceFrom !== null}
              onClick={goNext}
              className="right-2"
            >
              <ChevronRight />
            </StageButton>
            <DialogClose asChild>
              <Button
                ref={closeRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("close")}
                className="absolute top-2 right-2 text-white hover:bg-white/15 hover:text-white"
              >
                <X className="size-5" />
              </Button>
            </DialogClose>
          </div>

          <aside
            aria-label={t("details")}
            className="bg-background text-foreground flex max-h-[45dvh] flex-col gap-4 overflow-y-auto p-5 lg:max-h-none lg:border-l"
          >
            {showReview ? (
              <GalleryReviewBanner
                key={item.id}
                slug={slug}
                item={item}
                canReview={canModerate}
                onRestored={() => onChanged?.(item.id, { gone: false })}
                onRemoved={() => deleted(item.id)}
              />
            ) : null}

            <div className="flex items-center gap-3">
              <Avatar>
                {item.uploader?.image ? (
                  <AvatarImage src={item.uploader.image} alt="" />
                ) : null}
                <AvatarFallback>
                  {item.uploader ? (
                    getInitials(item.uploader.name)
                  ) : (
                    // A deleted member: no initials of a person.
                    <UserRound aria-hidden="true" className="size-4" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">
                  {uploaderName(item)}
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  <RelativeTime date={item.createdAt} />
                  {length ? ` · ${t("video", { duration: length })}` : null}
                </span>
              </div>
            </div>

            {caption ? (
              <p className="text-base break-words">{caption}</p>
            ) : null}

            <dl className="grid gap-2 text-sm">
              <Fact term={t("event")}>
                {item.event ? (
                  <Link
                    href={`/events/${item.event.slug}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {item.event.title}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t("noEvent")}</span>
                )}
              </Fact>
              <Fact term={t("category")}>
                {item.topicSlug ? (
                  <GalleryCategoryBadge
                    slug={slug}
                    topicSlug={item.topicSlug}
                  />
                ) : (
                  <span className="text-muted-foreground">
                    {t("noCategory")}
                  </span>
                )}
              </Fact>
              <Fact term={t("whoCanSee")}>
                <Badge variant="outline">
                  {item.visibility === "public" ? (
                    <Globe aria-hidden="true" />
                  ) : (
                    <Lock aria-hidden="true" />
                  )}
                  {item.visibility === "public"
                    ? t("everyone")
                    : t("membersOnly")}
                </Badge>
              </Fact>
              <Fact term={t("magazine")}>
                {item.magazineConsent ? (
                  <Badge variant="success">
                    <Check aria-hidden="true" />
                    {t("magazineYes")}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">
                    {t("magazineNo")}
                  </span>
                )}
              </Fact>
              {alt !== "" ? (
                <Fact term={t("description")}>
                  <span className="text-muted-foreground break-words">
                    {alt}
                  </span>
                </Fact>
              ) : null}
            </dl>

            {canEdit || canDelete || canReport ? (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit?.(item)}
                  >
                    <Pencil aria-hidden="true" />
                    {t("edit")}
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => void askToDelete()}
                  >
                    <Trash2 aria-hidden="true" />
                    {remove.isPending ? t("deleting") : t("delete")}
                  </Button>
                ) : null}
                {canReport ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openReport({ item })}
                  >
                    <Flag aria-hidden="true" />
                    {t("report")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </aside>
        </DialogContent>
      </Dialog>
      {/*
        Beside the lightbox, not inside it: React events bubble through
        portals, so key presses here would reach the lightbox's arrow keys.
      */}
      {reporting ? (
        <GalleryReportDialog
          key={reporting.key}
          slug={slug}
          item={reporting.item}
          open={reporting.open}
          onOpenChange={(isOpen) => {
            if (!isOpen) closeReport();
          }}
          onReported={() => reported(reporting.item.id)}
        />
      ) : null}
    </>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Previous/next on the stage. At an end it is `aria-disabled`, not
 * `disabled`: a natively disabled button drops keyboard focus to the page
 * body, out of the dialog, the moment the last item is reached.
 */
function StageButton({
  label,
  unavailable,
  busy = false,
  onClick,
  className,
  children,
}: {
  label: string;
  unavailable: boolean;
  busy?: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-disabled={unavailable || undefined}
      aria-busy={busy || undefined}
      onClick={unavailable ? undefined : onClick}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-black/55",
        className,
      )}
    >
      {children}
    </Button>
  );
}
