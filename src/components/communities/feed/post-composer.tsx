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
import { DraftNotice } from "./editor/draft-notice";
import { EmojiPickerButton } from "./editor/emoji-picker-button";
import { FormatButtons } from "./editor/format-buttons";
import { TopicSelect } from "./editor/topic-select";
import { GifPickerButton, type PickedGif } from "./editor/gif-picker-button";
import { PictureAttachments } from "./editor/picture-attachments";
import { PostEditor } from "./editor/post-editor";
import {
  SEND_SHORTCUTS,
  ShortcutHint,
  ToolbarButton,
} from "./editor/toolbar-button";
import { usePostDraft } from "./editor/use-post-draft";
import { usePictureUploads } from "./editor/use-picture-uploads";
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
  // A post carries pictures (up to 4), a video or a GIF, never two kinds.
  const pictures = usePictureUploads();
  const imageButton = useRef<HTMLButtonElement>(null);
  const [gif, setGif] = useState<PickedGif | null>(null);
  const isUploading = pictures.uploading;
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

  const posted = () => {
    toast.success(t("postCreated"));
    text.setValue("");
    draft.clear();
  };

  const createPost = api.feed.createPost.useMutation({
    onSuccess: () => {
      posted();
      pictures.clear();
      setGif(null);
      void utils.feed.getFeed.invalidate();
      void utils.feed.getActivity.invalidate({ communitySlug: slug });
    },
    onError: (error) => {
      const code = error.data?.code;
      toast.error(
        code === "TOO_MANY_REQUESTS" && gif
          ? te("gifBusy")
          : code === "BAD_REQUEST" && gif
            ? te("gifGone")
            : t("toastCreateError"),
      );
    },
  });

  const addImageFiles = (files: File[]) => {
    setGif(null);
    const left = pictures.add(files);
    if (left > 0) toast.error(te("tooManyPictures"));
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) addImageFiles(files);
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
  // A picture that did not upload is retried or removed before posting.
  const blocked = pictures.failed;

  const submit = () => {
    // Waiting for a picture still uploading, so it is not left behind.
    if (!content.trim() || text.tooLong || busy || blocked) return;
    if (videoFile) {
      void submitVideo(videoFile);
      return;
    }
    createPost.mutate({
      communitySlug: slug,
      content: content.trim(),
      images: pictures.count > 0 ? pictures.choices() : undefined,
      gifId: gif?.giphyId,
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
        onImageFiles={
          videoFile || pictures.room <= 0 ? undefined : addImageFiles
        }
        imageRefusal={videoFile ? te("oneMediaOnly") : te("tooManyPictures")}
        onSubmitShortcut={submit}
        attachments={
          videoFile || pictures.count > 0 || gif ? (
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
              <PictureAttachments
                items={pictures.items}
                onAltChange={pictures.setAlt}
                onRemove={pictures.remove}
                onRetry={pictures.retry}
                onEmptied={() => imageButton.current?.focus()}
              />
              {gif ? (
                <MediaPreview
                  src={gif.preview.stillUrl}
                  alt={gif.title || t("gifBadge")}
                  badge={t("gifBadge")}
                  removeLabel={t("removeGif")}
                  onRemove={() => setGif(null)}
                />
              ) : null}
            </>
          ) : null
        }
        tools={
          <>
            {videoFile ? null : (
              <ToolbarButton
                ref={imageButton}
                label={
                  pictures.room <= 0
                    ? te("tooManyPictures")
                    : gif
                      ? t("replaceWithImage")
                      : t("addImage")
                }
                icon={<ImagePlus aria-hidden="true" className="size-4" />}
                disabled={pictures.room <= 0}
                onClick={() => fileInputRef.current?.click()}
              />
            )}
            {videoFile ? null : (
              <GifPickerButton
                communitySlug={slug}
                label={
                  gif
                    ? t("replaceWithGif")
                    : pictures.count > 0
                      ? te("replacePicturesWithGif")
                      : te("gif")
                }
                onPick={(picked) => {
                  setGif(picked);
                  if (pictures.count === 0) return;
                  // One click must not lose pictures and their descriptions.
                  const saved = pictures.snapshot();
                  pictures.clear();
                  toast(te("picturesReplacedByGif"), {
                    action: {
                      label: te("undo"),
                      onClick: () => {
                        setGif(null);
                        pictures.restore(saved);
                      },
                    },
                  });
                }}
                disabled={isUploading}
              />
            )}
            {pictures.count > 0 || gif || videoFile ? null : (
              <ToolbarButton
                label={tv("add")}
                icon={<Film aria-hidden="true" className="size-4" />}
                disabled={isUploading}
                onClick={() => videoInputRef.current?.click()}
              />
            )}
            <EmojiPickerButton onPick={text.insert} />
            <FormatButtons text={text} />
            <TopicSelect
              communitySlug={slug}
              value={topicSlug}
              onChange={setTopicSlug}
            />
          </>
        }
        actions={
          <ShortcutHint hint={te("submitShortcut")}>
            <Button
              type="submit"
              size="sm"
              disabled={!content.trim() || text.tooLong || busy || blocked}
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
          blocked ? (
            <p className="text-destructive text-xs">{te("fixPictures")}</p>
          ) : (pictures.count > 0 || gif || videoFile) && !content.trim() ? (
            <p className="text-muted-foreground text-xs">
              {te("addWordsToPost")}
            </p>
          ) : draft.restored ? (
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
        multiple
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
