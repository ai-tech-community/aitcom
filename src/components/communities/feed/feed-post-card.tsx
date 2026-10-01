"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useConfirm } from "@/components/confirm-dialog";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { getInitials } from "@/lib/avatar";
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
import type { ShownMention } from "./linkified-text";
import { ReportDialog } from "./report-dialog";
import { ReportedBanner } from "./reported-banner";
import { FeedGif, type FeedGifView } from "./feed-gif";
import { FeedImageGallery, type GalleryImage } from "./feed-image-gallery";
import { PostEditForm } from "./post-edit-form";

interface FeedPost {
  id: number;
  content: string;
  imageUrl?: string | null;
  authorId: string;
  authorName?: string | null;
  authorImage?: string | null;
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
  gif?: FeedGifView | null;
  images?: (GalleryImage & { id: number })[] | null;
  /** Whom the post mentions, and whether each profile is open. */
  mentions?: ShownMention[] | null;
}

interface FeedPostCardProps {
  post: FeedPost;
  currentUserId?: string | null;
  memberRole?: string | null;
  communitySlug: string;
  /** Refetches the feed; resolves once the fresh posts are in. */
  onRefresh: () => Promise<unknown>;
  onToggleComments: (postId: number) => void;
  showComments: boolean;
}

export function FeedPostCard({
  post,
  currentUserId,
  memberRole,
  communitySlug,
  onRefresh,
  onToggleComments,
  showComments,
}: FeedPostCardProps) {
  const t = useTranslations("communities.feed");
  const tReport = useTranslations("communities.report");
  const tVideo = useTranslations("communities.video");
  const confirm = useConfirm();
  const { requireAuth } = useRequireAuth();
  const [isEditing, setIsEditing] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Opening the editor from the menu: its text box takes focus, not the
  // menu button the menu would otherwise return focus to.
  const openingEditor = useRef(false);
  const [reportOpen, setReportOpen] = useState(false);

  const isAuthor = !!currentUserId && post.authorId === currentUserId;
  const isPrivileged =
    memberRole === "owner" ||
    memberRole === "admin" ||
    memberRole === "moderator";

  const toggleLike = api.feed.toggleLike.useMutation({
    onSuccess: () => void onRefresh(),
    onError: () => toast.error(t("toastLikeError")),
  });

  const deletePost = api.feed.deletePost.useMutation({
    onSuccess: () => {
      toast.success(t("postDeleted"));
      void onRefresh();
    },
    onError: () => toast.error(t("toastPostDeleteError")),
  });

  const pinPost = api.feed.pinPost.useMutation({
    onSuccess: () => void onRefresh(),
    onError: (e) =>
      toast.error(
        e.message === "PIN_CAP_REACHED" ? t("pinCapReached") : "Failed to pin",
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

  return (
    <div
      ref={cardRef}
      className="border-border space-y-3 rounded-lg border p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            {post.authorImage ? (
              <AvatarImage src={post.authorImage} alt={post.authorName ?? ""} />
            ) : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm leading-tight font-medium">
              {post.authorName ?? "Member"}
            </p>
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              {post.isPinned ? (
                <span className="text-foreground inline-flex items-center gap-0.5">
                  <Pin className="size-3 fill-current" /> {t("pinned")}
                </span>
              ) : null}
              <span>
                <RelativeTime date={post.createdAt} className="text-xs" />
                {post.isEdited ? ` · (${t("edited")})` : ""}
              </span>
              {post.video?.visibility === "public" ? (
                <Badge variant="outline">{tVideo("publicBadge")}</Badge>
              ) : null}
            </p>
          </div>
        </div>

        {(isAuthor || isPrivileged) && currentUserId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuButton}
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={t("postActions")}
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                if (openingEditor.current) {
                  openingEditor.current = false;
                  e.preventDefault();
                }
              }}
            >
              {isAuthor && (
                <DropdownMenuItem
                  onClick={() => {
                    openingEditor.current = true;
                    setIsEditing(true);
                  }}
                >
                  {t("edit")}
                </DropdownMenuItem>
              )}
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
      ) : (
        <FormattedPostText text={post.content} mentions={post.mentions ?? []} />
      )}

      {/* Media (the edit form shows its own while editing) */}
      {isEditing ? null : post.video ? (
        <FeedVideoPlayer video={post.video} onExpired={refreshVideo} />
      ) : post.gif?.mp4Url ? (
        <FeedGif gif={post.gif} />
      ) : post.images?.length ? (
        <FeedImageGallery images={post.images} />
      ) : post.imageUrl ? (
        // A legacy post shows its one picture by URL, with no description.
        <FeedImageGallery images={[{ url: post.imageUrl, alt: "" }]} />
      ) : link && !isEditing && !post.linkPreview?.hidden ? (
        <LinkPreviewCard href={link} preview={linkPreview} />
      ) : null}

      {/* Actions */}
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

        {currentUserId && !isAuthor && !post.hiddenAt ? (
          <>
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
            <ReportDialog
              postId={post.id}
              open={reportOpen}
              onOpenChange={setReportOpen}
            />
          </>
        ) : null}
      </div>

      {/* Comments — part of the same card/thread as the post */}
      {showComments ? (
        <div className="border-border -mx-4 mt-1 border-t px-4 pt-3">
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
    </div>
  );
}
