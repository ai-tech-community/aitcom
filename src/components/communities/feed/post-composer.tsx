"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Film, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { VideoVisibility } from "@/lib/video-rules";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";
import { MediaPreview } from "./media-preview";
import {
  uploadFeedImage,
  type UploadedFeedImage,
} from "./upload-feed-image";
import { DraftNotice } from "./editor/draft-notice";
import { EmojiPickerButton } from "./editor/emoji-picker-button";
import { PostEditor } from "./editor/post-editor";
import {
  SEND_SHORTCUTS,
  ShortcutHint,
  ToolbarButton,
} from "./editor/toolbar-button";
import { usePostDraft } from "./editor/use-post-draft";
import { usePostText } from "./editor/use-post-text";

interface PostComposerProps {
  slug: string;
  /** The signed-in member; their unsent draft is kept per community. */
  userId: string;
  canPost: boolean;
}

export function PostComposer({ slug, userId, canPost }: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const te = useTranslations("communities.feed.editor");
  const tc = useTranslations("common");
  const tv = useTranslations("communities.video");
  const utils = api.useUtils();
  const text = usePostText("");
  const draft = usePostDraft({
    userId,
    target: `new:${slug}`,
    base: "",
    text: text.value,
    restore: text.setValue,
  });
  const [image, setImage] = useState<UploadedFeedImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [topicSlug, setTopicSlug] = useState("general");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<VideoVisibility>("community");
  const videoPost = useVideoPost(slug);
  const videoBusy =
    videoPost.state.step === "preparing" ||
    videoPost.state.step === "uploading" ||
    videoPost.state.step === "posting";
  const content = text.value;

  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });

  const posted = () => {
    toast.success(t("postCreated"));
    text.setValue("");
    draft.clear();
  };

  const createPost = api.feed.createPost.useMutation({
    onSuccess: () => {
      posted();
      setImage(null);
      void utils.feed.getFeed.invalidate();
      void utils.feed.getActivity.invalidate({ communitySlug: slug });
    },
    onError: () => {
      toast.error(t("toastCreateError"));
    },
  });

  const addImageFile = async (file: File) => {
    setIsUploading(true);
    try {
      setImage(await uploadFeedImage(file));
    } catch {
      toast.error(tc("uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void addImageFile(file);
  };

  const handleVideoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      videoPost.reset();
      // Refuse a clip that cannot work before a caption is written.
      void videoPost.check(file);
    }
    e.target.value = "";
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVisibility("community");
    videoPost.reset();
  };

  const submitVideo = async (file: File) => {
    const ok = await videoPost.post({
      file,
      caption: content.trim(),
      visibility,
      topicSlug,
    });
    if (!ok) return;
    posted();
    setVideoFile(null);
    setVisibility("community");
  };

  const handleRetry = () => {
    if (!videoFile || !content.trim() || videoBusy) return;
    void submitVideo(videoFile);
  };

  const busy = createPost.isPending || videoBusy || isUploading;

  const submit = () => {
    // Waiting for a picture still uploading, so it is not left behind.
    if (!content.trim() || text.tooLong || busy) return;
    if (videoFile) {
      void submitVideo(videoFile);
      return;
    }
    createPost.mutate({
      communitySlug: slug,
      content: content.trim(),
      imageId: image?.id,
      topicSlug,
    });
  };

  if (!canPost) return null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <PostEditor
        text={text}
        label={t("composePlaceholder")}
        placeholder={t("composePlaceholder")}
        // A post carries one image or one video, never both.
        onImageFile={
          videoFile || isUploading ? undefined : (f) => void addImageFile(f)
        }
        imageRefusal={videoFile ? te("oneMediaOnly") : te("waitForUpload")}
        onSubmitShortcut={submit}
        attachments={
          videoFile || image ? (
            <>
              {videoFile ? (
                <VideoAttachment
                  file={videoFile}
                  visibility={visibility}
                  onVisibilityChange={setVisibility}
                  onRemove={removeVideo}
                  onCancel={videoPost.cancel}
                  onRetry={handleRetry}
                  state={videoPost.state}
                />
              ) : null}
              {image ? (
                <MediaPreview
                  src={image.url}
                  alt={t("attachedImage")}
                  removeLabel={t("removeImage")}
                  onRemove={() => setImage(null)}
                />
              ) : null}
            </>
          ) : null
        }
        tools={
          <>
            {videoFile ? null : (
              <ToolbarButton
                label={image ? t("replaceWithImage") : t("addImage")}
                icon={
                  isUploading ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <ImagePlus aria-hidden="true" className="size-4" />
                  )
                }
                disabled={isUploading}
                aria-busy={isUploading}
                onClick={() => fileInputRef.current?.click()}
              />
            )}
            {image || videoFile ? null : (
              <ToolbarButton
                label={tv("add")}
                icon={<Film aria-hidden="true" className="size-4" />}
                disabled={isUploading}
                onClick={() => videoInputRef.current?.click()}
              />
            )}
            <EmojiPickerButton onPick={text.insert} />
            {/* One topic is no choice; the select appears once there are two. */}
            {topics && topics.length > 1 ? (
              <select
                value={topicSlug}
                onChange={(e) => setTopicSlug(e.target.value)}
                className="border-border bg-background ml-1 h-8 max-w-44 truncate rounded-md border px-2 text-sm"
                aria-label={t("selectTopic")}
              >
                {topics.map((tp) => (
                  <option key={tp.id} value={tp.slug}>
                    {tp.emoji ? `${tp.emoji} ` : ""}
                    {tp.label}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        }
        actions={
          <ShortcutHint hint={te("submitShortcut")}>
            <Button
              type="submit"
              size="sm"
              disabled={!content.trim() || text.tooLong || busy}
              aria-busy={busy}
              aria-keyshortcuts={SEND_SHORTCUTS}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {t("post")}
            </Button>
          </ShortcutHint>
        }
        notice={
          draft.restored ? (
            <DraftNotice
              onDiscard={() => {
                text.setValue("");
                draft.clear();
              }}
            />
          ) : null
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImagePick}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoPick}
      />
    </form>
  );
}
