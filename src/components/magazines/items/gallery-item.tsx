import { useId } from "react";

import { Lock, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { galleryItemLabelText } from "@/lib/gallery-rules";
import { cn } from "@/lib/utils";

import { FactSeparator } from "./fact-separator";
import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle, ItemViewOfKind } from "./types";

type GalleryView = ItemViewOfKind<"galleryItem">;

/**
 * Large pictures keep their shape within limits, as on the gallery wall: a
 * panorama or a tall phone photo is cropped instead of turning into a
 * sliver or a tower.
 */
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 2;

function pictureRatio(view: Pick<GalleryView, "width" | "height">): number {
  const ratio = view.width / view.height;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/** The item's name: its caption, else its alt text, else "Photo by …". */
function useGalleryItemName(view: GalleryView): string {
  // Root-level: the label carries fully qualified message keys.
  const translate = useTranslations();
  return galleryItemLabelText(view.label, translate);
}

/**
 * How the picture's link is reached. A lead or card has no other link to the
 * item, so its picture is the link, named by the item's heading when the
 * picture has no alt text of its own. In a row or related item the name next
 * to the picture is the link, so the picture's copy of it is skipped by
 * keyboard and screen readers.
 */
type PictureLink =
  | { kind: "named"; labelledBy: string | null }
  | { kind: "duplicate" };

/**
 * The picture, linked to the item in its community's gallery. A video shows
 * its thumbnail with a play badge (glyph plus the word, so the kind is
 * never told by the glyph alone); the badge sits inside the link, so the
 * link says it leads to a video. There is no inline playback in an issue.
 *
 * The links are signed per request and never kept: the picture reads them
 * from the view on every render, so a refreshed view shows the new link.
 */
function GalleryPicture({
  view,
  alt,
  small,
  link,
  priority = false,
}: {
  view: GalleryView;
  alt: string;
  small: boolean;
  link: PictureLink;
  /** The lead: usually above the fold, so it loads first. */
  priority?: boolean;
}) {
  const t = useTranslations("magazines.item");
  const badgeId = useId();
  const isVideo = view.mediaType === "video";
  // A video's own file is never an image source; nor is a full photo in a thumbnail slot.
  const src = small || isVideo ? view.thumbnailUrl : view.url;
  const labelledBy =
    link.kind === "named" && link.labelledBy
      ? [link.labelledBy, ...(isVideo ? [badgeId] : [])].join(" ")
      : undefined;

  return (
    <Link
      href={view.href as never}
      {...(link.kind === "duplicate"
        ? { tabIndex: -1, "aria-hidden": true }
        : { "aria-labelledby": labelledBy })}
      className={cn(
        // gallery-picture-link: magazine.css keeps this inset ring inside a publication.
        "gallery-picture-link bg-secondary relative block min-w-0 overflow-hidden",
        // Drawn inside the picture: a card clips anything outside it.
        "focus-visible:outline-ring focus-visible:outline-[3px] focus-visible:-outline-offset-[3px]",
        small && "aspect-square w-24 shrink-0 sm:w-32",
      )}
      style={small ? undefined : { aspectRatio: pictureRatio(view) }}
    >
      {/* Signed links change every request: never through the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={view.width}
        height={view.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="size-full object-cover"
      />
      {isVideo && (
        <span
          id={badgeId}
          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 py-0.5 pr-2 pl-1.5 text-xs text-white"
        >
          <span className="sr-only">, </span>
          <Play aria-hidden="true" className="size-2.5 fill-current" />
          <span>{t("galleryVideo")}</span>
        </span>
      )}
    </Link>
  );
}

/** "Photo by {name}", then the event it is from, linked. */
function GalleryCredit({ view }: { view: GalleryView }) {
  const t = useTranslations("magazines.item");
  const { event } = view;
  return (
    <p className="text-muted-foreground text-sm break-words">
      <span>
        {t("galleryCredit", {
          mediaType: view.mediaType,
          name: view.uploader.name,
        })}
      </span>
      {event && (
        <>
          <FactSeparator />
          <span>
            {t.rich("galleryEvent", {
              event: event.title,
              link: (chunks) => (
                <Link
                  href={`/events/${event.slug}`}
                  className="text-foreground underline-offset-4 hover:underline focus-visible:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </>
      )}
    </p>
  );
}

/**
 * Editors only: people outside the community cannot open this item. Readers
 * always get `membersOnly: false`.
 */
function MembersOnlyMarker({ view }: { view: GalleryView }) {
  const t = useTranslations("magazines.item");
  if (!view.membersOnly) return null;
  return (
    <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <Lock aria-hidden="true" className="size-3 shrink-0" />
      {t("membersOnly")}
    </p>
  );
}

/**
 * The picture's alt text: the item's own, unless it is the name already
 * shown next to the picture as text. Every size shows the name (a lead or
 * card as its heading, visible when it is the caption), so a picture without
 * alt text of its own adds nothing to it and is left unnamed.
 */
function altText(view: GalleryView, name: string): string {
  const own = view.alt?.trim();
  return own && own !== name ? own : "";
}

function ItemName({ view, name }: { view: GalleryView; name: string }) {
  return (
    <Link
      href={view.href as never}
      className="underline-offset-4 hover:underline focus-visible:underline"
    >
      {name}
    </Link>
  );
}

/**
 * A community gallery photo or video featured in an issue. The picture is
 * the item, so a lead or card is a figure (the caption as its caption, then
 * who added it and the event); a row or a related item is named by the
 * item's label next to a small picture.
 */
export function GalleryItem({ view, size }: ItemRendererProps<"galleryItem">) {
  const t = useTranslations("magazines.item");
  const headingId = useId();
  const name = useGalleryItemName(view);
  const alt = altText(view, name);
  const caption = view.caption?.trim();

  switch (size) {
    case "row":
      return (
        <div className="flex min-w-0 items-start gap-4 py-4">
          <GalleryPicture
            view={view}
            alt={alt}
            small
            link={{ kind: "duplicate" }}
          />
          {/* The row's baseline is its name's, not the picture's bottom edge:
              the only baseline-aligned item gives a flex row its baseline. */}
          <div className="min-w-0 flex-1 self-baseline [&>[data-item-kind]]:py-0">
            <ItemRow
              kind="galleryItem"
              title={<ItemName view={view} name={name} />}
              label={t("galleryKind")}
              intro={view.intro}
              note={
                <>
                  <GalleryCredit view={view} />
                  <MembersOnlyMarker view={view} />
                </>
              }
            />
          </div>
        </div>
      );
    case "related":
      return (
        <article
          data-item-kind="galleryItem"
          className="bg-card text-card-foreground flex h-full min-w-0 items-start gap-4 rounded-xl border p-5"
        >
          <GalleryPicture
            view={view}
            alt={alt}
            small
            link={{ kind: "duplicate" }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="text-lg leading-snug font-semibold tracking-tight break-words">
              <ItemName view={view} name={name} />
            </h2>
            {view.intro && <p className="text-sm">{view.intro}</p>}
            <GalleryCredit view={view} />
            <MembersOnlyMarker view={view} />
          </div>
        </article>
      );
    case "lead":
    case "card":
      break;
    default: {
      const exhaustive: never = size;
      return exhaustive;
    }
  }
  const isLead = size === "lead";
  const hasNotes = Boolean(view.intro) || view.membersOnly;

  return (
    <article
      data-item-kind="galleryItem"
      className={cn(
        "flex h-full min-w-0 flex-col",
        isLead
          ? "gap-4"
          : "bg-card text-card-foreground gap-2 overflow-hidden rounded-xl border pb-5",
      )}
    >
      <figure className="flex min-w-0 flex-col">
        <GalleryPicture
          view={view}
          alt={alt}
          small={false}
          link={{ kind: "named", labelledBy: alt ? null : headingId }}
          priority={isLead}
        />
        <figcaption
          className={cn(
            // gallery-card-text: magazine.css lines it up with the picture's edge.
            "flex flex-col gap-1 break-words",
            isLead ? "pt-3" : "gallery-card-text px-5 pt-4",
          )}
        >
          {/* The item's heading, like other kinds' leads and cards: the
              caption when there is one, else its name for screen readers. */}
          <h2
            id={headingId}
            className={cn(
              caption
                ? cn(
                    "leading-relaxed font-normal",
                    isLead ? "text-base @xl:text-lg" : "text-sm",
                  )
                : "sr-only",
            )}
          >
            {caption ?? name}
          </h2>
          <GalleryCredit view={view} />
        </figcaption>
      </figure>
      {hasNotes && (
        <div
          className={cn(
            "flex flex-col gap-2",
            !isLead && "gallery-card-text px-5",
          )}
        >
          {view.intro && <p className="text-sm">{view.intro}</p>}
          <MembersOnlyMarker view={view} />
        </div>
      )}
    </article>
  );
}

export const galleryItemTitle: ItemTitle<"galleryItem"> = (view, translate) =>
  galleryItemLabelText(view.label, translate);
