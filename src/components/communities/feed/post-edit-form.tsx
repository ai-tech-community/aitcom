"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Film, ImagePlus, Loader2, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VideoVisibility } from "@/lib/video-rules";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";
import { MediaPreview } from "./media-preview";
import { uploadFeedImage } from "./upload-feed-image";

/**
 * What the post will carry after the edit. A picked image stays on the
 * device until Save, so cancelling never leaves an uploaded file behind.
 */
type MediaEdit =
  | { kind: "keep" }
  | { kind: "none" }
  | { kind: "image"; file: File; previewUrl: string }
  | { kind: "video"; file: File };

export type EditablePost = {
  id: number;
  content: string;
  imageUrl?: string | null;
  visibility?: VideoVisibility | null;
  video?: { thumbnailUrl: string | null } | null;
  /** Set while a moderator reviews a report: the media stays as it is. */
  hiddenAt?: string | null;
};

/**
 * Editing a post: its text and its media, with the composer's controls.
 * A post carries one image or one video, never both. Its audience is fixed
 * after posting, so a new video goes to the same audience; a public post
 * whose video is removed becomes community-only (only video posts may be
 * public), and the form says so before saving. Nothing changes until Save.
 */
export function PostEditForm({
  post,
  communitySlug,
  onSaved,
  onCancel,
}: {
  post: EditablePost;
  communitySlug: string;
  /** After a successful save (refresh the feed, close the form). */
  onSaved: () => void;
  /** The member left without saving. */
  onCancel: () => void;
}) {
  const t = useTranslations("communities.feed");
  const tc = useTranslations("common");
  const tv = useTranslations("communities.video");
  const utils = api.useUtils();
  const [content, setContent] = useState(post.content);
  const [media, setMedia] = useState<MediaEdit>({ kind: "keep" });
  const [isUploading, setIsUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const videoPost = useVideoPost(communitySlug);
  const audience: VideoVisibility =
    post.visibility === "public" ? "public" : "community";
  const hadMedia = Boolean(post.imageUrl) || Boolean(post.video);
  const mediaLocked = Boolean(post.hiddenAt);

  // The local preview of a picked image lives as long as the pick.
  useEffect(() => {
    if (media.kind !== "image") return;
    const url = media.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [media]);

  const editPost = api.feed.editPost.useMutation({
    onSuccess: () => {
      // The reels strip is not part of the feed the card refreshes, and a
      // removed video's files are already gone.
      void utils.feed.getReels.invalidate({ communitySlug });
      toast.success(t("postEdited"));
      onSaved();
    },
    onError: (error) =>
      toast.error(
        error.data?.code === "CONFLICT" || error.data?.code === "FORBIDDEN"
          ? error.message
          : t("toastPostUpdateError"),
      ),
  });

  const videoBusy =
    videoPost.state.step === "preparing" ||
    videoPost.state.step === "uploading" ||
    videoPost.state.step === "posting";
  const busy = editPost.isPending || videoBusy || isUploading;
  const videoRefused =
    media.kind === "video" &&
    videoPost.state.step === "error" &&
    !videoPost.state.retryable;

  const showsOldImage = media.kind === "keep" && Boolean(post.imageUrl);
  const showsOldVideo = media.kind === "keep" && Boolean(post.video);
  const hasMedia = media.kind === "keep" ? hadMedia : media.kind !== "none";
  const losesPublic =
    audience === "public" &&
    Boolean(post.video) &&
    (media.kind === "none" || media.kind === "image");

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    videoPost.reset();
    setMedia({ kind: "image", file, previewUrl: URL.createObjectURL(file) });
  };

  const pickVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    videoPost.reset();
    setMedia({ kind: "video", file });
    // Refuse a clip that cannot work before the member saves.
    void videoPost.check(file);
  };

  const removeMedia = () => {
    videoPost.reset();
    setMedia({ kind: "none" });
    // The remove button is gone: keep keyboard focus in the form.
    imageButton.current?.focus();
  };

  const keepCurrent = () => {
    videoPost.reset();
    setMedia({ kind: "keep" });
  };

  const cancel = () => {
    if (videoPost.state.step === "posting") return;
    videoPost.cancel();
    onCancel();
  };

  const save = async () => {
    const caption = content.trim();
    if (!caption || busy || videoRefused) return;
    if (media.kind === "video") {
      const ok = await videoPost.post({
        file: media.file,
        caption,
        visibility: audience,
        replacePostId: post.id,
      });
      if (ok) {
        toast.success(t("postEdited"));
        onSaved();
      }
      return;
    }
    let change:
      | { kind: "keep" }
      | { kind: "none" }
      | { kind: "image"; url: string };
    if (media.kind === "image") {
      setIsUploading(true);
      try {
        change = { kind: "image", url: await uploadFeedImage(media.file) };
      } catch {
        toast.error(tc("uploadFailed"));
        return;
      } finally {
        setIsUploading(false);
      }
    } else {
      change = media;
    }
    editPost.mutate({
      postId: post.id,
      communitySlug,
      content: caption,
      media: change,
    });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        maxLength={2000}
        rows={3}
        className="resize-none"
        aria-label={t("editLabel")}
        autoFocus
      />

      {mediaLocked ? (
        <p className="text-muted-foreground text-sm">
          {t("mediaLockedWhileReviewed")}
        </p>
      ) : (
        <>
          {media.kind === "video" ? (
            <VideoAttachment
              file={media.file}
              visibility={audience}
              onRemove={removeMedia}
              onCancel={videoPost.cancel}
              onRetry={() => void save()}
              state={videoPost.state}
            />
          ) : null}

          {media.kind === "image" ? (
            <MediaPreview
              src={media.previewUrl}
              alt={t("attachedImage")}
              removeLabel={t("removeImage")}
              onRemove={removeMedia}
              disabled={busy}
            />
          ) : showsOldImage ? (
            <MediaPreview
              src={post.imageUrl ?? null}
              alt={t("currentImage")}
              removeLabel={t("removeImage")}
              onRemove={removeMedia}
              disabled={busy}
            />
          ) : showsOldVideo ? (
            <MediaPreview
              src={post.video?.thumbnailUrl ?? null}
              alt=""
              badge={
                <>
                  <Film aria-hidden="true" className="size-3" />
                  {t("currentVideo")}
                </>
              }
              removeLabel={tv("remove")}
              onRemove={removeMedia}
              disabled={busy}
            />
          ) : null}

          {/* Always mounted, so screen readers hear the warning when it
              appears (WCAG 4.1.3). */}
          <div role="status">
            {losesPublic ? (
              <p className="bg-warning/10 border-warning/30 text-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                <TriangleAlert
                  aria-hidden="true"
                  className="text-warning mt-0.5 size-4 shrink-0"
                />
                {t("becomesMembersOnly")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              ref={imageButton}
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" className="mr-1.5 size-4" />
              {hasMedia ? t("replaceWithImage") : t("addImage")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => videoInput.current?.click()}
            >
              <Film aria-hidden="true" className="mr-1.5 size-4" />
              {hasMedia ? t("replaceWithVideo") : tv("add")}
            </Button>
            {hadMedia && media.kind !== "keep" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={keepCurrent}
              >
                <Undo2 aria-hidden="true" className="mr-1.5 size-4" />
                {post.video ? t("keepCurrentVideo") : t("keepCurrentImage")}
              </Button>
            ) : null}
          </div>

          {media.kind === "keep" ? null : (
            <p className="text-muted-foreground text-xs">
              {t("mediaChangesOnSave")}
            </p>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!content.trim() || busy || videoRefused}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2
              aria-hidden="true"
              className="mr-1.5 size-4 animate-spin"
            />
          ) : null}
          {t("save")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={cancel}
          disabled={videoPost.state.step === "posting"}
        >
          {t("discardChanges")}
        </Button>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={pickImage}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={pickVideo}
      />
    </form>
  );
}
