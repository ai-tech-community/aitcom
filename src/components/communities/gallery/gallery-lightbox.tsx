"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  Pencil,
  Trash2,
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
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { useGalleryErrorText } from "./gallery-error-text";
import {
  formatClipLength,
  topicText,
  useGalleryItemLabel,
} from "./gallery-item-text";

/** Keys that belong to the focused control, not to the lightbox. */
const OWNS_ARROW_KEYS = "video, audio, input, textarea, select, [role=slider]";

function tileFor(itemId: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-gallery-item-id="${itemId}"]`,
  );
}

/**
 * One gallery item, large, in a modal dialog: the photo or video on a dark
 * stage, previous/next by button and ←/→ (not past the ends of `items`),
 * Esc or Close to leave. Focus goes to Close on open and back to the tile of
 * the item last shown on close (`GalleryTile` marks tiles with
 * `data-gallery-item-id`). The side panel says who added it, when, its
 * caption, event, category, audience, magazine permission and description.
 *
 * Actions: the uploader may edit (when `onEdit` is given) and delete;
 * moderators (`canModerate`) may delete anyone's item. The server decides
 * again on every call.
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
  canModerate = false,
  fallbackFocus,
}: {
  slug: string;
  /** The items prev/next move through, in wall order. */
  items: readonly GalleryItemView[];
  /** The open item; null (or an id not in `items`) closes the lightbox. */
  openId: number | null;
  onClose: () => void;
  onNavigate: (itemId: number) => void;
  onEdit?: (item: GalleryItemView) => void;
  /** Called after a delete succeeded, before the lightbox closes. */
  onDeleted?: (itemId: number) => void;
  canModerate?: boolean;
  /** Where focus goes when no tile is left to return to. */
  fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("gallery.lightbox");
  const labelFor = useGalleryItemLabel();
  const errorText = useGalleryErrorText();
  const confirm = useConfirm();
  const closeRef = useRef<HTMLButtonElement>(null);

  const index =
    openId === null ? -1 : items.findIndex((each) => each.id === openId);
  const current = index >= 0 ? items[index] : undefined;
  // The dialog animates out after `openId` clears: keep showing the item.
  const lastShown = useRef<GalleryItemView | undefined>(undefined);
  if (current) lastShown.current = current;
  const item = current ?? lastShown.current;
  const previous = index > 0 ? items[index - 1] : undefined;
  const next = index >= 0 ? items[index + 1] : undefined;

  // After a delete, focus goes to a neighbour's tile instead of the
  // removed one (or to `fallbackFocus` when it was the last).
  const afterDelete = useRef<{ neighbour: number | null } | null>(null);

  const remove = api.gallery.deleteItem.useMutation({
    onSuccess: (_data, input) => {
      toast.success(t("deleted"));
      afterDelete.current = { neighbour: (next ?? previous)?.id ?? null };
      onDeleted?.(input.itemId);
      onClose();
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
  const canDelete = item.isOwn || canModerate;
  const caption = item.caption?.trim();
  const alt = item.alt?.trim() ?? "";

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if ((event.target as Element).closest?.(OWNS_ARROW_KEYS)) return;
    const target =
      event.key === "ArrowLeft"
        ? previous
        : event.key === "ArrowRight"
          ? next
          : undefined;
    if (!target) return;
    event.preventDefault();
    onNavigate(target.id);
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
          const deleted = afterDelete.current;
          afterDelete.current = null;
          const target = deleted
            ? ((deleted.neighbour === null
                ? null
                : tileFor(deleted.neighbour)) ??
              fallbackFocus?.current ??
              null)
            : tileFor(item.id);
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
            disabled={!previous}
            onClick={() => previous && onNavigate(previous.id)}
            className="left-2"
          >
            <ChevronLeft />
          </StageButton>
          <StageButton
            label={t("next")}
            disabled={!next}
            onClick={() => next && onNavigate(next.id)}
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
          <div className="flex items-center gap-3">
            <Avatar>
              {item.uploader.image ? (
                <AvatarImage src={item.uploader.image} alt="" />
              ) : null}
              <AvatarFallback>{getInitials(item.uploader.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate font-medium">{item.uploader.name}</span>
              <span className="text-muted-foreground font-mono text-xs">
                <RelativeTime date={item.createdAt} />
                {length ? ` · ${t("video", { duration: length })}` : null}
              </span>
            </div>
          </div>

          {caption ? <p className="text-base break-words">{caption}</p> : null}

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
                <CategoryBadge slug={slug} topicSlug={item.topicSlug} />
              ) : (
                <span className="text-muted-foreground">{t("noCategory")}</span>
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
                <span className="text-muted-foreground">{t("magazineNo")}</span>
              )}
            </Fact>
            {alt !== "" ? (
              <Fact term={t("description")}>
                <span className="text-muted-foreground break-words">{alt}</span>
              </Fact>
            ) : null}
          </dl>

          {canEdit || canDelete ? (
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
            </div>
          ) : null}
        </aside>
      </DialogContent>
    </Dialog>
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

function CategoryBadge({
  slug,
  topicSlug,
}: {
  slug: string;
  topicSlug: string;
}) {
  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });
  return (
    <Badge variant="secondary">{topicText(topicSlug, topics ?? [])}</Badge>
  );
}

function StageButton({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  disabled: boolean;
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
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white",
        className,
      )}
    >
      {children}
    </Button>
  );
}
