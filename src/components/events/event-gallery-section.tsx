"use client";

import { useId, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { eventGalleryPath } from "@/components/communities/gallery/gallery-params";
import { GalleryTile } from "@/components/communities/gallery/gallery-tile";
import { useGalleryLightboxHost } from "@/components/communities/gallery/use-gallery-lightbox-host";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import type { EventGallerySection as Section } from "@/server/gallery/event-section";

/**
 * "Add yours", by who is looking: a member goes to the upload with this
 * event chosen; a guest signs in first and comes back to it; a non-member
 * who may join goes to the community page, where joining lives. Guests and
 * non-members see it only when the community lets someone new in
 * (`canJoin`, decided by the server). Ink, never orange: the event page's
 * Register keeps the one orange (One Voice Rule).
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
      if (!section.viewer.canJoin) return null;
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
  const grid = useRef<HTMLUListElement>(null);
  const { open, host } = useGalleryLightboxHost({
    slug,
    items,
    scope: grid,
    deletedFocus: grid,
    isMember: viewer.kind === "member",
    canModerate: viewer.kind === "member" && viewer.canModerate,
    onChange: () => router.refresh(),
  });

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

      {host}
    </section>
  );
}
