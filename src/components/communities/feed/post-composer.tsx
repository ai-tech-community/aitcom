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
import { uploadFeedImage } from "./upload-feed-image";
import { DraftNotice } from "./editor/draft-notice";
import { EmojiPickerButton } from "./editor/emoji-picker-button";
import { PostEditor } from "./editor/post-editor";
import { ToolbarButton } from "./editor/toolbar-button";
import { usePostDraft } from "./editor/use-post-draft";
import { usePostText } from "./editor/use-post-text";

interface PostComposerProps {
  slug: string;
  canPost: boolean;
}

export function PostComposer({ slug, canPost }: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const te = useTranslations("communities.feed.editor");
  const tc = useTranslations("common");
  const tv = useTranslations("communities.video");
  const utils = api.useUtils();
  const text = usePostText("");
  const draft = usePostDraft({
    key: `new:${slug}`,
    base: "",
    text: text.value,
    restore: text.setValue,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
      setImageUrl(null);
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
      setImageUrl(await uploadFeedImage(file));
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

  const submit = () => {
    if (!content.trim() || videoBusy || createPost.isPending) return;
    if (videoFile) {
      void submitVideo(videoFile);
      return;
    }
    createPost.mutate({
      communitySlug: slug,
      content: content.trim(),
      imageUrl: imageUrl ?? undefined,
      topicSlug,
    });
  };

  if (!canPost) return null;

  const busy = createPost.isPending || videoBusy;

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
        onSubmitShortcut={submit}
        attachments={
          videoFile || imageUrl ? (
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
              {imageUrl ? (
                <MediaPreview
                  src={imageUrl}
                  alt={t("attachedImage")}
                  removeLabel={t("removeImage")}
                  onRemove={() => setImageUrl(null)}
                />
              ) : null}
            </>
          ) : null
        }
        tools={
          <>
            {videoFile ? null : (
              <ToolbarButton
                label={imageUrl ? t("replaceWithImage") : t("addImage")}
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
            {imageUrl || videoFile ? null : (
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
          <Button
            type="submit"
            size="sm"
            disabled={!content.trim() || busy}
            aria-busy={busy}
            title={te("submitShortcut")}
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {t("post")}
          </Button>
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
