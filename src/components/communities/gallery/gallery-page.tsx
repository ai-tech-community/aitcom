"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadMore } from "@/components/ui/load-more";
import { SectionLabel } from "@/components/ui/section-label";
import { isModeratorRole } from "@/lib/communities/moderator-roles";
import type { GalleryItemView } from "@/server/gallery/items";
import { api } from "@/trpc/react";

import { useViewerSignedIn } from "../use-community-join";
import {
  GalleryAddAction,
  type GalleryViewerState,
} from "./gallery-add-action";
import { GalleryEditDialog } from "./gallery-edit-dialog";
import { useGalleryErrorText } from "./gallery-error-text";
import { GalleryLightbox } from "./gallery-lightbox";
import {
  galleryListInput,
  hasGalleryFilters,
  parseGalleryParams,
  readUploadLink,
  writeGalleryParams,
  type GalleryParamsPatch,
} from "./gallery-params";
import { GalleryToolbar } from "./gallery-toolbar";
import { GalleryWall, GalleryWallSkeleton } from "./gallery-wall";
import { useOpening } from "./use-opening";
import { useGalleryRefresh } from "./use-gallery-refresh";
import { useGalleryUploadLink } from "./use-gallery-upload-link";

/**
 * The upload dialog's code — with the video converter it pulls in — loads
 * only when someone opens it, not with the wall.
 */
const GalleryUploadDialog = dynamic(
  () =>
    import("./gallery-upload-dialog").then((mod) => mod.GalleryUploadDialog),
  { ssr: false },
);

/** The signed-in viewer's standing in this community, for the add action. */
function useGalleryViewer(slug: string): GalleryViewerState {
  const signedIn = useViewerSignedIn();
  const memberships = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: signedIn,
  });
  if (!signedIn) return { kind: "guest" };
  // Unknown standing offers nothing rather than a join prompt to a member.
  if (memberships.isPending || memberships.isError) return { kind: "loading" };
  const row = memberships.data?.find((each) => each.slug === slug);
  if (row?.status === "active") return { kind: "member", role: row.role };
  return { kind: "outsider", status: row?.status ?? null };
}

/**
 * The URL's filters and open item, written in place (history.replaceState,
 * which Next syncs into `useSearchParams`): the wall refetches through
 * tRPC, the server page is not rendered again, and Back leaves the gallery
 * instead of stepping through every filter.
 */
function useGalleryParams() {
  const searchParams = useSearchParams();
  const params = useMemo(
    () => parseGalleryParams(searchParams),
    [searchParams],
  );
  const uploadLink = useMemo(
    () => readUploadLink(searchParams),
    [searchParams],
  );
  const setParams = useCallback((patch: GalleryParamsPatch) => {
    const url = new URL(window.location.href);
    const next = writeGalleryParams(url.searchParams, patch).toString();
    window.history.replaceState(
      null,
      "",
      next ? `${url.pathname}?${next}` : url.pathname,
    );
  }, []);
  return [params, setParams, uploadLink] as const;
}

/**
 * A community's Gallery tab (spec 2026-11-13, variant A): the header with
 * the add action, the filters, the wall, the lightbox, and the upload and
 * Edit details dialogs. Everything the viewer may not see is filtered by
 * the server; this only decides what to offer.
 */
export function GalleryPage({ slug }: { slug: string }) {
  const t = useTranslations("gallery");
  const errorText = useGalleryErrorText();
  const refresh = useGalleryRefresh(slug);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [params, setParams, uploadLink] = useGalleryParams();
  const viewer = useGalleryViewer(slug);
  const isMember = viewer.kind === "member";
  const canModerate = isMember && isModeratorRole(viewer.role);

  const [upload, openUploadWith, closeUpload] = useOpening<{
    eventId: number | null;
  }>();
  const openUpload = useCallback(
    (eventId: number | null = null) => openUploadWith({ eventId }),
    [openUploadWith],
  );
  const dropUploadLink = useCallback(
    () => setParams({ upload: null }),
    [setParams],
  );
  useGalleryUploadLink({
    link: uploadLink,
    viewer,
    intent: t("page.signInToAdd"),
    openUpload,
    dropLink: dropUploadLink,
  });
  const [editing, openEdit, closeEdit] = useOpening<{
    item: GalleryItemView;
  }>();

  const community = api.communities.getBySlug.useQuery({ slug });
  const facets = api.gallery.facets.useQuery({ slug });
  const topics = api.topics.list.useQuery({ communitySlug: slug });
  const list = api.gallery.list.useInfiniteQuery(
    galleryListInput(slug, params),
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  const items = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data],
  );

  // A linked item (`?item=`) that is not on the loaded wall is fetched on
  // its own and shown alone.
  const openId = params.item;
  const onWall = openId !== null && items.some((each) => each.id === openId);
  const linked = api.gallery.item.useQuery(
    { slug, itemId: openId ?? 0 },
    { enabled: openId !== null && !list.isPending && !onWall },
  );
  const lightboxItems = useMemo(
    () => (onWall || !linked.data ? items : [linked.data]),
    [onWall, linked.data, items],
  );

  // Gone, hidden or never readable: say so and drop it from the URL.
  useEffect(() => {
    if (!linked.isError) return;
    // Only NOT_FOUND means gone; anything else is a failed load.
    toast.error(errorText(linked.error, "loadFailed"));
    setParams({ item: null });
  }, [linked.isError, linked.error, errorText, setParams]);

  const addAction = (
    <GalleryAddAction
      slug={slug}
      communityName={community.data?.name}
      joinPolicy={community.data?.joinPolicy}
      viewer={viewer}
      onUpload={() => openUpload()}
    />
  );

  const filtered = hasGalleryFilters(params);
  let wall: React.ReactNode;
  if (list.isPending) {
    wall = <GalleryWallSkeleton />;
  } else if (list.isError) {
    wall = <ErrorState onRetry={() => void list.refetch()} />;
  } else if (items.length === 0) {
    wall = filtered ? (
      <EmptyState
        title={t("wall.filteredEmptyTitle")}
        description={t("wall.filteredEmptyBody")}
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setParams({ event: null, topic: null, type: null })}
          >
            {t("wall.showEverything")}
          </Button>
        }
      />
    ) : isMember ? (
      <EmptyState
        icon={<ImagePlus />}
        title={t("wall.emptyTitle")}
        description={t("wall.emptyBody")}
        action={
          // The header keeps the orange; this copy of the action is quiet.
          <Button type="button" variant="outline" onClick={() => openUpload()}>
            <ImagePlus aria-hidden="true" />
            {t("page.add")}
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<ImagePlus />}
        title={t("wall.outsiderEmptyTitle")}
        description={t("wall.outsiderEmptyBody")}
      />
    );
  } else {
    wall = (
      <>
        <GalleryWall
          items={items}
          showEvent={params.event === null}
          onOpen={(itemId) => setParams({ item: itemId })}
        />
        <LoadMore query={list} label={t("wall.loadMore")} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <SectionLabel as="p" bordered={false}>
            {t("page.kicker")}
          </SectionLabel>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl leading-tight font-semibold tracking-tight outline-none"
          >
            {t("page.title")}
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">
            {isMember ? t("page.membersLine") : t("page.outsiderLine")}
          </p>
        </div>
        {addAction}
      </header>

      <GalleryToolbar
        filters={params}
        facets={facets.data}
        topics={topics.data ?? []}
        onChange={setParams}
      />

      {wall}

      <GalleryLightbox
        slug={slug}
        items={lightboxItems}
        openId={openId}
        onNavigate={(itemId) => setParams({ item: itemId })}
        onClose={() => setParams({ item: null })}
        onEdit={isMember ? (item) => openEdit({ item }) : undefined}
        onDeleted={refresh.deleted}
        onChanged={(itemId, { gone }) =>
          gone ? refresh.deleted(itemId) : refresh.changed(itemId)
        }
        canModerate={canModerate}
        signedIn={viewer.kind !== "guest"}
        fallbackFocus={headingRef}
        more={onWall ? list : undefined}
      />

      {upload ? (
        <GalleryUploadDialog
          key={upload.key}
          slug={slug}
          open={upload.open}
          onOpenChange={(open) => {
            if (open) return;
            closeUpload();
            dropUploadLink();
          }}
          initialEventId={upload.eventId ?? undefined}
        />
      ) : null}
      {editing ? (
        <GalleryEditDialog
          key={editing.key}
          slug={slug}
          item={editing.item}
          open={editing.open}
          onOpenChange={(open) => {
            if (!open) closeEdit();
          }}
        />
      ) : null}
    </div>
  );
}
