"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useConfirm } from "@/components/confirm-dialog";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { firstLink } from "@/lib/links";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Flag, Heart, MessageSquare, MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";
import { FeedComments } from "./feed-comments";
import { FeedVideoPlayer, type FeedVideo } from "./feed-video-player";
import { LinkPreviewCard } from "./link-preview-card";
import { FormattedPostText } from "./formatted-post-text";
import type { FeedPollView } from "@/lib/poll-rules";
import { EVERYONE } from "@/lib/post-mentions";
import { canBroadcast } from "@/lib/community-broadcast";
import type { ShownMention } from "./linkified-text";
import { ReportDialog } from "./report-dialog";
import { ReportedBanner } from "./reported-banner";
import { GifPlayer, type GifView } from "@/components/media/gif-player";
import { FeedPoll } from "./feed-poll";
import { FeedImageGallery, type GalleryImage } from "./feed-image-gallery";
import { PostEditForm } from "./post-edit-form";
import { GalleryCollage } from "../gallery/gallery-collage";
import type { FeedGalleryView } from "@/server/gallery/feed-view";
import type { MemberCard } from "@/server/members/member-card";
import { MemberHoverName } from "@/components/members/member-hover-name";

interface FeedPost {
  id: number;
  content: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  authorId: string;
  authorName?: string | null;
  authorImage?: string | null;
  /** Whether the author's name links to their profile, and its preview. */
  authorCard: MemberCard;
  communityId?: string | null;
  likeCount?: number | null;
  commentCount?: number | null;
  isDeleted?: boolean | null;
  isEdited?: boolean | null;
  editedAt?: string | null;
  createdAt: string;
  isPinned?: boolean | null;
  topicSlug?: string | null;
  hasLiked: boolean;
  video?: FeedVideo | null;
  /** Preview of the first link in `content`, stored when the post was saved. */
  linkPreview?: {
    url?: string | null;
    title?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    siteName?: string | null;
    /** The author took the preview off; the link stays in the text. */
    hidden?: boolean | null;
  } | null;
  /** Set when the post was reported; only its author and moderators see it. */
  hiddenAt?: string | null;
  visibility?: "community" | "public" | null;
  gif?: GifView | null;
  images?: (GalleryImage & { id: number })[] | null;
  /** Whom the post mentions, and whether each profile is open. */
  mentions?: ShownMention[] | null;
  /** The post's poll with its counts and the viewer's vote. */
  poll?: FeedPollView | null;
  /** When the post's "@everyone" went out to the community. */
  announcedAt?: string | null;
  /** The post announces a gallery batch (its media is fixed). */
  isGalleryPost?: boolean;
  /** The batch's items this viewer may see; null when none (text only). */
  gallery?: FeedGalleryView | null;
}

/**
 * What a card changed about its post, so a list can update that one post in
 * its cache instead of reloading every page it has loaded.
 */
export type FeedPostChange =
  | { kind: "liked"; postId: number; liked: boolean; likeCount: number }
  | { kind: "deleted"; postId: number };

interface FeedPostCardProps {
  post: FeedPost;
  currentUserId?: string | null;
  memberRole?: string | null;
  communitySlug: string;
  /** Refetches the feed; resolves once the fresh posts are in. */
  onRefresh: () => Promise<unknown>;
  /**
   * Applies a like or a delete to the list in place. Without it, the card
   * refetches the feed for those too.
   */
  onPostChange?: (change: FeedPostChange) => void;
  onToggleComments: (postId: number) => void;
  showComments: boolean;
  home?: { topicLabel?: string };
}

export function FeedPostCard({
  post,
  currentUserId,
  memberRole,
  communitySlug,
  onRefresh,
  onPostChange,
  onToggleComments,
  showComments,
  home,
}: FeedPostCardProps) {
  const t = useTranslations("communities.feed");
  const th = useTranslations("redesign.homeFeed");
  const tReport = useTranslations("communities.report");
  const tVideo = useTranslations("communities.video");
  const tCard = useTranslations("memberCard");
  const confirm = useConfirm();
  const { requireAuth } = useRequireAuth();
  const [isEditing, setIsEditing] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Opening the editor from the menu: its text box takes focus, not the
  // menu button the menu would otherwise return focus to.
  const openingPostControl = useRef(false);
  const [reportOpen, setReportOpen] = useState(false);
  const commentsId = useId();

  // A delete in the collage can take the last item this viewer may see:
  // the collage goes, and the focused tile with it. Focus then moves to the
  // post's menu (or the card), never down to the page body. The flag lasts
  // only until the collage reloads: once it comes back with items (after an
  // edit, or a delete that left some), a later empty collage is not this
  // change's doing.
  const collageChanged = useRef(false);
  const gallery = post.gallery ?? null;
  useLayoutEffect(() => {
    if (!collageChanged.current) return;
    collageChanged.current = false;
    if (gallery) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    if (menuButton.current) {
      menuButton.current.focus();
    } else if (cardRef.current) {
      cardRef.current.setAttribute("tabindex", "-1");
      cardRef.current.focus();
    }
  }, [gallery]);

  const isAuthor = !!currentUserId && post.authorId === currentUserId;
  const isPrivileged =
    memberRole === "owner" ||
    memberRole === "admin" ||
    memberRole === "moderator";
  const canManage = Boolean(currentUserId && (isAuthor || isPrivileged));
  const canReport = Boolean(currentUserId && !isAuthor && !post.hiddenAt);

  const toggleLike = api.feed.toggleLike.useMutation({
    onSuccess: ({ liked, likeCount }) => {
      if (onPostChange) {
        onPostChange({ kind: "liked", postId: post.id, liked, likeCount });
      } else {
        void onRefresh();
      }
    },
    onError: () => toast.error(t("toastLikeError")),
  });

  const deletePost = api.feed.deletePost.useMutation({
    onSuccess: () => {
      toast.success(t("postDeleted"));
      if (onPostChange) onPostChange({ kind: "deleted", postId: post.id });
      else void onRefresh();
    },
    onError: () => toast.error(t("toastPostDeleteError")),
  });

  const pinPost = api.feed.pinPost.useMutation({
    onSuccess: () => {
      const list = home
        ? cardRef.current?.closest<HTMLElement>("[data-community-activity]")
        : null;
      void onRefresh().then(() => {
        if (!list) return;
        // A pin can move the post between sections. Restore the trigger if
        // the old card disappeared and the member hasn't moved focus.
        requestAnimationFrame(() => {
          if (document.activeElement !== document.body || !list.isConnected)
            return;
          const replacement = list.querySelector<HTMLElement>(
            `[data-home-feed-post="${post.id}"] [data-feed-post-menu]`,
          );
          (replacement ?? list).focus();
        });
      });
    },
    onError: (e) =>
      toast.error(
        e.message === "PIN_CAP_REACHED"
          ? t("pinCapReached")
          : home
            ? th("pinError")
            : "Failed to pin",
      ),
  });

  /**
   * A private video link failed: refetch the feed, which re-signs it. The
   * refetch cannot tell whether the link changed (links are stable within a
   * signing window), so this resolves true once it is done and the player
   * compares the `video.url` it then receives with the one that failed.
   */
  const refreshVideo = async () => {
    await onRefresh();
    return true;
  };

  if (post.isDeleted) {
    return (
      <div className="border-border rounded-lg border px-4 py-3">
        <p className="text-muted-foreground font-mono text-xs">
          {t("postDeletedMessage")}
        </p>
      </div>
    );
  }

  const initials = getInitials(post.authorName ?? "?");
  const link = firstLink(post.content);
  // Only a preview of the link the post shows now: never a stale one.
  const linkPreview =
    link && post.linkPreview?.url === link ? post.linkPreview : null;
  const mentions = post.announcedAt
    ? [...(post.mentions ?? []), { userId: EVERYONE, name: EVERYONE }]
    : (post.mentions ?? []);
  const likeCount = post.likeCount ?? 0;
  const commentCount = post.commentCount ?? 0;
  const postText = (
    <FormattedPostText
      text={post.content}
      mentions={mentions}
      className={home ? "max-w-prose text-base leading-relaxed" : undefined}
    />
  );

  const Card = home ? "article" : "div";
  return (
    <Card
      ref={cardRef}
      data-home-feed-post={home ? post.id : undefined}
      // Focusable only as the fallback above; then it shows the ring.
      className={cn(
        "border-border focus-visible:border-ring focus-visible:ring-ring/50 min-w-0 space-y-3 rounded-lg border p-4 [overflow-wrap:anywhere] outline-none focus-visible:ring-[3px]",
        home && "bg-card sm:px-5",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar className={home ? "size-9" : "size-8"}>
            {post.authorImage ? (
              <AvatarImage src={post.authorImage} alt={post.authorName ?? ""} />
            ) : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p
              className="text-sm leading-tight"
              dir={home ? "auto" : undefined}
            >
              <MemberHoverName
                member={{
                  userId: post.authorId,
                  name: post.authorName ?? tCard("fallback"),
                  image: post.authorImage ?? null,
                  card: post.authorCard,
                }}
              />
            </p>
            {post.gallery ? (
              <p className="text-muted-foreground text-xs leading-tight">
                {t("galleryAdded", { count: post.gallery.total })}
              </p>
            ) : null}
            <p
              className={cn(
                "text-muted-foreground flex items-center gap-1 text-xs",
                home && "mt-0.5 flex-wrap gap-x-1.5",
              )}
            >
              {post.isPinned && !home ? (
                <span className="text-foreground inline-flex items-center gap-0.5">
                  <Pin className="size-3 fill-current" /> {t("pinned")}
                </span>
              ) : null}
              <span>
                <RelativeTime date={post.createdAt} className="text-xs" />
                {post.isEdited ? ` · (${t("edited")})` : ""}
              </span>
              {home?.topicLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <bdi>{home.topicLabel}</bdi>
                </>
              ) : null}
              {post.video?.visibility === "public" ? (
                <Badge variant="outline">{tVideo("publicBadge")}</Badge>
              ) : null}
            </p>
          </div>
        </div>

        {canManage || (home && canReport) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuButton}
                variant="ghost"
                size="icon"
                className={
                  home
                    ? "-me-2 -mt-2 size-11 shrink-0 sm:size-9"
                    : "size-7 shrink-0"
                }
                aria-label={t("postActions")}
                data-feed-post-menu={home ? "" : undefined}
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={
                home
                  ? "motion-reduce:animate-none max-lg:[&_[role=menuitem]]:min-h-11"
                  : undefined
              }
              onCloseAutoFocus={(e) => {
                if (openingPostControl.current) {
                  openingPostControl.current = false;
                  e.preventDefault();
                }
              }}
            >
              {isAuthor && (
                <DropdownMenuItem
                  onClick={() => {
                    openingPostControl.current = true;
                    setIsEditing(true);
                  }}
                >
                  {t("edit")}
                </DropdownMenuItem>
              )}
              {canManage ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    if (
                      await confirm({
                        description: t("deletePostConfirm"),
                        destructive: true,
                      })
                    ) {
                      deletePost.mutate({ postId: post.id });
                    }
                  }}
                >
                  {t("delete")}
                </DropdownMenuItem>
              ) : null}
              {isPrivileged && (
                <DropdownMenuItem
                  onClick={() =>
                    pinPost.mutate({
                      postId: post.id,
                      isPinned: !post.isPinned,
                    })
                  }
                >
                  {post.isPinned ? t("unpinPost") : t("pinPost")}
                </DropdownMenuItem>
              )}
              {home && canReport ? (
                <DropdownMenuItem
                  className="min-h-11 cursor-pointer sm:min-h-8"
                  onSelect={() => {
                    openingPostControl.current = true;
                    setReportOpen(true);
                  }}
                >
                  <Flag aria-hidden="true" />
                  {tReport("action")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {post.hiddenAt ? (
        <ReportedBanner postId={post.id} canReview={isPrivileged} />
      ) : null}

      {/* Content */}
      {isEditing && currentUserId ? (
        <PostEditForm
          post={post}
          userId={currentUserId}
          communitySlug={communitySlug}
          canAnnounce={canBroadcast(memberRole)}
          onSaved={() => {
            setIsEditing(false);
            menuButton.current?.focus();
            // A topic change can take the post out of the filtered feed:
            // then keep keyboard focus in the list it was in.
            const list = cardRef.current?.parentElement ?? null;
            void onRefresh().then(() => {
              if (cardRef.current?.isConnected || !list?.isConnected) return;
              list.setAttribute("tabindex", "-1");
              list.focus();
            });
          }}
          onCancel={() => {
            setIsEditing(false);
            menuButton.current?.focus();
          }}
        />
      ) : !post.content.trim() ? null : ( // A post may be just a picture, GIF or video: then no text block.
        postText
      )}

      {/* Media (the edit form shows its own while editing). A gallery post
          whose batch the viewer may see none of shows its text only. */}
      {isEditing ? null : post.video ? (
        <FeedVideoPlayer video={post.video} onExpired={refreshVideo} />
      ) : post.gif?.mp4Url ? (
        <GifPlayer gif={post.gif} />
      ) : post.images?.length ? (
        <FeedImageGallery images={post.images} />
      ) : post.imageUrl ? (
        // A legacy post shows its one picture by URL, with no description.
        <FeedImageGallery
          images={[{ url: post.imageUrl, alt: post.imageAlt ?? "" }]}
        />
      ) : post.poll ? (
        <FeedPoll
          postId={post.id}
          poll={post.poll}
          viewer={!currentUserId ? "guest" : memberRole ? "member" : "outsider"}
        />
      ) : post.gallery ? (
        <GalleryCollage
          slug={communitySlug}
          gallery={post.gallery}
          memberRole={memberRole}
          signedIn={!!currentUserId}
          onChange={() => {
            collageChanged.current = true;
            void onRefresh();
          }}
        />
      ) : post.isGalleryPost ? null : link &&
        !isEditing &&
        !post.linkPreview?.hidden ? (
        <LinkPreviewCard href={link} preview={linkPreview} />
      ) : null}

      {/* Actions */}
      {home ? (
        <div className="border-border -mb-2 flex flex-wrap items-center gap-x-2 border-t pt-1 sm:gap-x-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ms-2 min-h-11 px-2 sm:min-h-9"
            disabled={toggleLike.isPending}
            aria-label={th("like")}
            aria-description={
              likeCount ? th("likeCount", { count: likeCount }) : undefined
            }
            aria-pressed={post.hasLiked}
            onClick={() =>
              requireAuth(
                () => toggleLike.mutate({ postId: post.id }),
                th("signInToLike"),
              )
            }
          >
            <Heart
              aria-hidden="true"
              className={post.hasLiked ? "fill-current" : undefined}
            />
            {th("like")}
            {likeCount ? (
              <span className="text-muted-foreground font-mono text-xs">
                {likeCount}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 px-2 sm:min-h-9"
            aria-expanded={showComments}
            aria-controls={showComments ? commentsId : undefined}
            onClick={() => onToggleComments(post.id)}
          >
            <MessageSquare aria-hidden="true" />
            {commentCount
              ? th("comments", { count: commentCount })
              : th("comment")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={() =>
              requireAuth(
                () => toggleLike.mutate({ postId: post.id }),
                "Sign in to like posts",
              )
            }
            className="flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50"
            disabled={toggleLike.isPending}
          >
            <Heart
              className={`size-4 ${post.hasLiked ? "fill-foreground text-foreground" : "text-muted-foreground"}`}
            />
            <span className="text-muted-foreground font-mono text-xs">
              {post.likeCount ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleComments(post.id)}
            className="flex items-center gap-1.5 text-sm transition-colors"
          >
            <MessageSquare className="text-muted-foreground size-4" />
            <span className="text-muted-foreground font-mono text-xs">
              {post.commentCount ?? 0}
            </span>
          </button>

          {canReport ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground ml-auto"
              onClick={() => setReportOpen(true)}
            >
              <Flag aria-hidden="true" />
              {tReport("action")}
            </Button>
          ) : null}
        </div>
      )}
      {canReport ? (
        <ReportDialog
          postId={post.id}
          open={reportOpen}
          onOpenChange={(open) => {
            setReportOpen(open);
            if (home && !open)
              requestAnimationFrame(() => menuButton.current?.focus());
          }}
        />
      ) : null}

      {/* Comments — part of the same card/thread as the post */}
      {showComments ? (
        <div
          id={home ? commentsId : undefined}
          className={cn(
            "border-border -mx-4 mt-1 border-t px-4 pt-3",
            home && "sm:-mx-5 sm:px-5",
          )}
        >
          <FeedComments
            postId={post.id}
            communitySlug={communitySlug}
            currentUserId={currentUserId ?? undefined}
            memberRole={
              memberRole as
                | "owner"
                | "admin"
                | "moderator"
                | "member"
                | null
                | undefined
            }
          />
        </div>
      ) : null}
    </Card>
  );
}
