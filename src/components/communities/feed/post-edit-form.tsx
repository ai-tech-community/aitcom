"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Film, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VideoVisibility } from "@/lib/video-rules";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";
import { uploadFeedImage } from "./upload-feed-image";

/** What the post will carry after the edit. */
type MediaEdit =
  | { kind: "keep" }
  | { kind: "none" }
  | { kind: "image"; url: string }
  | { kind: "video"; file: File };

export type EditablePost = {
  id: number;
  content: string;
  imageUrl?: string | null;
  topicSlug?: string | null;
  visibility?: VideoVisibility | null;
  video?: { thumbnailUrl: string | null } | null;
};

/**
 * Editing a post: its text and its media, with the composer's controls.
 * A post carries one image or one video, never both. Its audience is fixed
 * after posting, so a new video goes to the same audience; a public post
 * whose video is removed becomes members-only (only video posts may be
 * public), and the form says so before saving.
 */
export function PostEditForm({
  post,
  communitySlug,
  onSaved,
  onCancel,
}: {
  post: EditablePost;
  communitySlug: string;
  /** After a successful save (refresh the feed and close the form). */
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("communities.feed");
  const tc = useTranslations("common");
  const tv = useTranslations("communities.video");
  const [content, setContent] = useState(post.content);
  const [media, setMedia] = useState<MediaEdit>({ kind: "keep" });
  const [isUploading, setIsUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const videoPost = useVideoPost(communitySlug);
  const audience: VideoVisibility =
    post.visibility === "public" ? "public" : "community";

  const editPost = api.feed.editPost.useMutation({
    onSuccess: () => {
      toast.success(t("postEdited"));
      onSaved();
    },
    onError: () => toast.error(t("toastPostUpdateError")),
  });

  const videoBusy =
    videoPost.state.step === "preparing" ||
    videoPost.state.step === "uploading" ||
    videoPost.state.step === "posting";
  const busy = editPost.isPending || videoBusy || isUploading;

  // What is on the post while editing.
  const showsImage =
    media.kind === "image"
      ? media.url
      : media.kind === "keep"
        ? (post.imageUrl ?? null)
        : null;
  const showsOldVideo = media.kind === "keep" && Boolean(post.video);
  const hasMedia =
    Boolean(showsImage) || showsOldVideo || media.kind === "video";
  const losesPublic =
    audience === "public" &&
    Boolean(post.video) &&
    (media.kind === "none" || media.kind === "image");

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadFeedImage(file);
      videoPost.reset();
      setMedia({ kind: "image", url });
    } catch {
      toast.error(tc("uploadFailed"));
    } finally {
      setIsUploading(false);
    }
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
  };

  const save = async () => {
    const caption = content.trim();
    if (!caption || busy) return;
    if (media.kind === "video") {
      const ok = await videoPost.post({
        file: media.file,
        caption,
        visibility: audience,
        topicSlug: post.topicSlug ?? "general",
        replacePostId: post.id,
      });
      if (ok) {
        toast.success(t("postEdited"));
        onSaved();
      }
      return;
    }
    editPost.mutate({
      postId: post.id,
      communitySlug,
      content: caption,
      media,
    });
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        className="resize-none"
        aria-label={t("editLabel")}
        autoFocus
      />

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

      {showsImage || showsOldVideo ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- S3 or
              signed thumbnail URLs, not optimizable assets */}
          <img
            src={showsImage ?? post.video?.thumbnailUrl ?? ""}
            alt={showsImage ? t("currentImage") : t("currentVideo")}
            className="max-h-48 rounded-lg object-cover"
          />
          {showsOldVideo ? (
            <span className="bg-background/90 absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs">
              <Film aria-hidden="true" className="size-3" />
              {t("currentVideo")}
            </span>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 size-6"
            onClick={removeMedia}
            disabled={busy}
            aria-label={showsImage ? t("removeImage") : tv("remove")}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      {losesPublic ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t("becomesMembersOnly")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => imageInput.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 size-4" />
          )}
          {hasMedia ? t("replaceWithImage") : t("addImage")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => videoInput.current?.click()}
        >
          <Film className="mr-1.5 size-4" />
          {hasMedia ? t("replaceWithVideo") : tv("add")}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!content.trim() || busy}
        >
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          {t("save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            videoPost.cancel();
            onCancel();
          }}
          disabled={videoPost.state.step === "posting"}
        >
          {t("cancel")}
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
    </div>
  );
}
