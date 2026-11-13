"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { GalleryEditDialog } from "@/components/communities/gallery/gallery-edit-dialog";
import { GalleryLightbox } from "@/components/communities/gallery/gallery-lightbox";
import { eventGalleryPath } from "@/components/communities/gallery/gallery-params";
import { GalleryTile } from "@/components/communities/gallery/gallery-tile";
import { useOpening } from "@/components/communities/gallery/use-opening";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import type { EventGallerySection as Section } from "@/server/gallery/event-section";
import type { GalleryItemView } from "@/server/gallery/items";

/**
 * "Add yours", by who is looking: a member goes to the upload with this
 * event chosen; a guest signs in first and comes back to it; a non-member
 * who may join goes to the community page, where joining lives. Ink, never
 * orange: the event page's Register keeps the one orange (One Voice Rule).
 */
function AddYours({ section }: { section: Section }) {
  const t = useTranslations("gallery.event");
  const locale = useLocale();
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const upload = eventGalleryPath(section.communitySlug, section.eventId, {
    upload: true,
  });
  const label = (
    <>
      <ImagePlus aria-hidden="true" />
      {t("add")}
    </>
  );

  switch (section.viewer.kind) {
    case "member":
      return (
        <Button asChild variant="ink">
          <Link href={upload}>{label}</Link>
        </Button>
      );
    case "guest":
      return (
        <Button
          type="button"
          variant="ink"
          onClick={() =>
            requireAuth(() => router.push(upload), t("signInToAdd"), {
              returnTo: getPathname({ href: upload, locale }),
            })
          }
        >
          {label}
        </Button>
      );
    case "outsider":
      if (!section.viewer.canJoin) return null;
      return (
        <Button asChild variant="ink">
          <Link href={`/communities/${section.communitySlug}`}>{label}</Link>
        </Button>
      );
  }
}

/**
 * An event's "Photos and videos" (spec 2026-11-13, Events): the newest
 * items this viewer may see as square tiles that open the gallery
 * lightbox, "See all N in the gallery" when there are more, and "Add
 * yours". The server picked the items and decided the section is shown at
 * all (`loadEventGallerySection`); after an edit or delete the page is
 * loaded again, since the items come with it.
 */
export function EventGallerySection({ section }: { section: Section }) {
  const t = useTranslations("gallery.event");
  const router = useRouter();
  const headingId = useId();
  const { communitySlug: slug, items, total, viewer } = section;
  const isMember = viewer.kind === "member";
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, openEdit, closeEdit] = useOpening<{
    item: GalleryItemView;
  }>();
  const grid = useRef<HTMLUListElement>(null);
  // The tile that opened the lightbox, where focus returns when the item
  // shown last was deleted.
  const opener = useRef<HTMLElement | null>(null);

  const open = (itemId: number) => {
    opener.current =
      grid.current?.querySelector<HTMLElement>(
        `[data-gallery-item-id="${itemId}"]`,
      ) ?? null;
    setOpenId(itemId);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="border-border border-t pt-8"
    >
      <div className="border-border flex items-baseline justify-between gap-4 border-b pb-2">
        <SectionLabel id={headingId} bordered={false}>
          {t("title")}
        </SectionLabel>
        {total > 0 ? (
          <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase tabular-nums">
            {t("count", { count: total })}
          </span>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul
          ref={grid}
          // Focus lands here when the tile it would go back to was deleted.
          tabIndex={-1}
          className="focus-visible:ring-ring/50 mt-4 grid grid-cols-2 gap-2 rounded-lg outline-none focus-visible:ring-[3px] sm:grid-cols-3"
        >
          {items.map((item) => (
            <li key={item.id} className="aspect-square">
              <GalleryTile
                item={item}
                // Every item here is from this event.
                showEvent={false}
                onOpen={open}
                fill
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">{t("empty")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AddYours section={section} />
        {total > items.length ? (
          <Button asChild variant="outline">
            <Link href={eventGalleryPath(slug, section.eventId)}>
              {t("seeAll", { count: total })}
            </Link>
          </Button>
        ) : null}
      </div>

      <GalleryLightbox
        slug={slug}
        items={items}
        openId={openId}
        onNavigate={setOpenId}
        onClose={() => setOpenId(null)}
        onEdit={isMember ? (item) => openEdit({ item }) : undefined}
        onDeleted={(itemId) => {
          if (opener.current?.dataset.galleryItemId === String(itemId)) {
            opener.current = grid.current;
          }
          router.refresh();
        }}
        canModerate={viewer.kind === "member" && viewer.canModerate}
        fallbackFocus={opener}
        focusScope={grid}
      />
      {editing ? (
        <GalleryEditDialog
          key={editing.key}
          slug={slug}
          item={editing.item}
          open={editing.open}
          onOpenChange={(isOpen) => {
            if (!isOpen) closeEdit();
          }}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </section>
  );
}
