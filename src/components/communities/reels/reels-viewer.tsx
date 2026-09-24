"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { FeedComments } from "../feed/feed-comments";
import { ReportDialog } from "../feed/report-dialog";
import { JoinButton } from "../join-button";
import { ReelSlide } from "./reel-slide";
import { replaceReelVideo, toggleLikeInPages } from "./reels-state";

type MemberRole = "owner" | "admin" | "moderator" | "member";
type JoinPolicy = "open" | "invite_only" | "approval_required";
type MembershipStatus = "active" | "pending_approval" | "invited" | null;

/** Reels fetched per page. */
const PAGE_SIZE = 8;
/**
 * How long scrolling must pause before the reel on screen is re-read, for
 * browsers without the `scrollend` event.
 */
const SCROLL_SETTLE_MS = 150;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Typing targets keep their own arrow keys. */
function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

/**
 * Full-screen Reels mode: one video per screen with vertical scroll snap.
 *
 * - Controls: swipe and mouse wheel (native snap scrolling), ↑/↓ keys, and
 *   Esc or the close link back to the community page.
 * - It is a modal dialog (Radix), so focus moves in and stays in, the page
 *   behind is hidden from assistive tech, and Esc in a dialog opened on top
 *   (comments, report, sign-in) closes only that one.
 * - Only the current reel and the next one mount a video; the rest show a
 *   thumbnail and download nothing.
 * - Visitors (signed out, or not members) get the sign-in dialog or the Join
 *   prompt from like and comment, never a failing action.
 */
export function ReelsViewer({
  slug,
  startAtPostId,
  currentUserId,
  memberRole,
  membershipStatus,
  joinPolicy,
}: {
  slug: string;
  startAtPostId: number | null;
  currentUserId: string | null;
  memberRole: MemberRole | null;
  membershipStatus: MembershipStatus;
  joinPolicy: JoinPolicy;
}) {
  const t = useTranslations("communities.reels");
  const tFeed = useTranslations("communities.feed");
  const router = useRouter();
  const utils = api.useUtils();
  const { promptAuth } = useRequireAuth();
  const isMember = !!memberRole;
  const communityPath = `/communities/${slug}`;

  const contentRef = useRef<HTMLDivElement>(null);
  const slides = useRef<Array<HTMLElement | null>>([]);
  /**
   * The reel on screen, by id, plus the slot it was last seen in. The id is
   * the source of truth, so the viewer stays on the same video when the list
   * is replaced (new posts on top) and falls back to the slot, clamped, when
   * that video leaves the list.
   */
  const [current, setCurrent] = useState<{ id: number | null; slot: number }>({
    id: null,
    slot: 0,
  });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const [reportFor, setReportFor] = useState<number | null>(null);
  const [joinPromptOpen, setJoinPromptOpen] = useState(false);

  const input = useMemo(
    () => ({ communitySlug: slug, limit: PAGE_SIZE, startAtPostId }),
    [slug, startAtPostId],
  );
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = api.feed.getReels.useInfiniteQuery(input, {
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // A refetch re-signs every private link and restarts the video that is
    // playing. Expired links are refreshed one reel at a time instead.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const foundAt =
    current.id === null ? -1 : items.findIndex((r) => r.id === current.id);
  const index =
    foundAt >= 0
      ? foundAt
      : Math.min(current.slot, Math.max(items.length - 1, 0));

  // Keep `current` pointing at the reel in `index`. When the list was
  // replaced and that reel moved, bring its slide back on screen.
  useEffect(() => {
    const id = items[index]?.id ?? null;
    if (id === current.id && index === current.slot) return;
    if (index !== current.slot) {
      slides.current[index]?.scrollIntoView?.({ block: "start" });
    }
    setCurrent({ id, slot: index });
  }, [items, index, current]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );
  const notice = data?.pages[0]?.notice ?? null;

  const like = api.feed.toggleLike.useMutation({
    onMutate: async ({ postId }) => {
      await utils.feed.getReels.cancel(input);
      const previous = utils.feed.getReels.getInfiniteData(input);
      utils.feed.getReels.setInfiniteData(input, (current) =>
        toggleLikeInPages(current, postId),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      utils.feed.getReels.setInfiniteData(input, context?.previous);
      toast.error(tFeed("toastLikeError"));
    },
  });

  // Joining here changes what this viewer may see and do.
  const wasMember = useRef(isMember);
  useEffect(() => {
    if (isMember && !wasMember.current) void utils.feed.getReels.invalidate();
    wasMember.current = isMember;
  }, [isMember, utils]);

  // Load the next page before the viewer reaches the end.
  useEffect(() => {
    if (
      items.length > 0 &&
      index >= items.length - 2 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage();
    }
  }, [index, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  function show(slot: number) {
    setCurrent({ id: items[slot]?.id ?? null, slot });
  }

  function goTo(next: number) {
    const target = Math.max(0, Math.min(next, items.length - 1));
    show(target);
    slides.current[target]?.scrollIntoView?.({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Dialogs opened on top are portalled outside this element, and their
    // key events still bubble here through React; leave those alone.
    const target = event.target as Node | null;
    if (!contentRef.current?.contains(target) || isEditable(event.target)) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      goTo(index - 1);
    }
  }

  /**
   * Reads which reel the scroller came to rest on. Scroll events in between
   * never move the index, so a smooth scroll started by ↑/↓ is not pulled
   * back by its own first frames, and players do not remount mid-swipe.
   */
  function settle(el: HTMLElement) {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    if (el.clientHeight === 0) return;
    const slot = Math.max(
      0,
      Math.min(Math.round(el.scrollTop / el.clientHeight), items.length - 1),
    );
    if (slot !== index) show(slot);
  }

  /**
   * A private link expired: re-sign only that reel and patch it in place.
   * Resolves false (or rejects, if the fetch fails) when no fresh link is
   * coming, e.g. the video can no longer be watched, so the player shows
   * "Video unavailable" instead of freezing.
   */
  async function refreshVideo(postId: number): Promise<boolean> {
    const fresh = await utils.feed.getReels.fetch(
      { communitySlug: slug, startAtPostId: postId, limit: 1 },
      { staleTime: 0 },
    );
    const reel = fresh.items[0];
    const video = reel?.id === postId ? reel.video : null;
    if (!video) return false;
    utils.feed.getReels.setInfiniteData(input, (cached) =>
      replaceReelVideo(cached, postId, video),
    );
    return true;
  }

  /** Members act; everyone else gets the sign-in dialog or the Join prompt. */
  function asMember(signInIntent: string, action: () => void) {
    if (!currentUserId) promptAuth(signInIntent);
    else if (!isMember) setJoinPromptOpen(true);
    else action();
  }

  function copyLink(postId: number) {
    const url = `${window.location.origin}${window.location.pathname}?v=${postId}`;
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) {
      toast.error(t("copyFailed"));
      return;
    }
    clipboard.writeText(url).then(
      () => toast.success(t("linkCopied")),
      () => toast.error(t("copyFailed")),
    );
  }

  const showHeaderJoin = !isMember && notice !== "members_only";

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="flex h-full items-center justify-center p-6">
        <div className="aspect-[9/16] h-full max-h-[80dvh] animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none" />
      </div>
    );
  } else if (isError && !data) {
    body = (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState onRetry={() => void refetch()} />
      </div>
    );
  } else if (notice) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base">
          {notice === "members_only" ? t("membersOnly") : t("unavailable")}
        </p>
        {notice === "members_only" && !isMember ? (
          <JoinButton
            slug={slug}
            joinPolicy={joinPolicy}
            membershipStatus={membershipStatus}
            memberRole={memberRole}
          />
        ) : null}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState title={t("empty")} />
      </div>
    );
  } else {
    body = (
      <div
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (settleTimer.current) clearTimeout(settleTimer.current);
          settleTimer.current = setTimeout(() => settle(el), SCROLL_SETTLE_MS);
        }}
        onScrollEnd={(event) => settle(event.currentTarget)}
      >
        {items.map((reel, i) => (
          <ReelSlide
            key={reel.id}
            ref={(node) => {
              slides.current[i] = node;
            }}
            reel={reel}
            position={{ current: i + 1, total: items.length }}
            loadVideo={i === index || i === index + 1}
            isCurrent={i === index}
            canReport={
              !!currentUserId &&
              reel.authorId !== currentUserId &&
              !reel.hiddenAt
            }
            likePending={like.isPending && like.variables?.postId === reel.id}
            onLike={() =>
              asMember(t("signInToLike"), () =>
                like.mutate({ postId: reel.id }),
              )
            }
            onComments={() =>
              asMember(t("signInToComment"), () => setCommentsFor(reel.id))
            }
            onCopyLink={() => copyLink(reel.id)}
            onReport={() => setReportFor(reel.id)}
            onVideoExpired={() => refreshVideo(reel.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) router.push(communityPath);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Focus the viewer itself so ↑/↓ work at once and screen readers
            // announce "Reels" rather than the first button.
            event.preventDefault();
            contentRef.current?.focus();
          }}
          onKeyDown={onKeyDown}
          className="dark fixed inset-0 z-50 bg-black text-white outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {t("title")}
          </DialogPrimitive.Title>
          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/75 to-transparent p-4 pb-10">
            <span className="font-mono text-xs tabular-nums" aria-live="polite">
              {items.length > 0 && !notice
                ? t("position", {
                    current: index + 1,
                    total: items.length,
                  })
                : null}
            </span>
            <div className="pointer-events-auto flex items-center gap-2">
              {showHeaderJoin ? (
                <JoinButton
                  slug={slug}
                  joinPolicy={joinPolicy}
                  membershipStatus={membershipStatus}
                  memberRole={memberRole}
                />
              ) : null}
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="focus-visible:ring-ring size-11 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white focus-visible:ring-[3px]"
              >
                <Link href={communityPath} aria-label={t("close")}>
                  <X aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </header>

          {body}

          <Sheet
            open={commentsFor !== null}
            onOpenChange={(open) => {
              if (!open) setCommentsFor(null);
            }}
          >
            <SheetContent
              side="bottom"
              aria-describedby={undefined}
              className="max-h-[85dvh] overflow-y-auto sm:mx-auto sm:max-w-lg sm:rounded-t-lg"
            >
              <SheetHeader>
                <SheetTitle>{t("commentsTitle")}</SheetTitle>
              </SheetHeader>
              {commentsFor !== null ? (
                <div className="px-4 pb-4">
                  <FeedComments
                    postId={commentsFor}
                    communitySlug={slug}
                    currentUserId={currentUserId ?? undefined}
                    memberRole={memberRole}
                  />
                </div>
              ) : null}
            </SheetContent>
          </Sheet>

          {reportFor !== null ? (
            <ReportDialog
              postId={reportFor}
              open
              onOpenChange={(open) => {
                if (!open) setReportFor(null);
              }}
            />
          ) : null}

          <Dialog
            open={joinPromptOpen && !isMember}
            onOpenChange={setJoinPromptOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("joinTitle")}</DialogTitle>
                <DialogDescription>
                  {joinPolicy === "invite_only"
                    ? t("inviteOnly")
                    : t("joinDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <JoinButton
                  slug={slug}
                  joinPolicy={joinPolicy}
                  membershipStatus={membershipStatus}
                  memberRole={memberRole}
                />
              </div>
            </DialogContent>
          </Dialog>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
