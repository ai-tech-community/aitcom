"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { ChartBar, Film, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { VideoVisibility } from "@/lib/video-rules";
import { pollProblem, type PollChoice } from "@/lib/poll-rules";
import { mentionsEveryone } from "@/lib/post-mentions";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";
import { MediaPreview } from "./media-preview";
import { DraftNotice } from "./editor/draft-notice";
import { EmojiPickerButton } from "./editor/emoji-picker-button";
import { FormatButtons } from "./editor/format-buttons";
import { TopicSelect } from "./editor/topic-select";
import { GifPickerButton, type PickedGif } from "./editor/gif-picker-button";
import { PictureAttachments } from "./editor/picture-attachments";
import { emptyPoll, PollBuilder } from "./editor/poll-builder";
import { MentionButton, useMentionPicker } from "./editor/mention-picker";
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
  /** May announce with "@everyone" (`canBroadcast`): warned before posting. */
  canAnnounce?: boolean;
}

export function PostComposer({
  slug,
  userId,
  canPost,
  canAnnounce = false,
}: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const te = useTranslations("communities.feed.editor");
  const tv = useTranslations("communities.video");
  const utils = api.useUtils();
  const text = usePostText("");
  const mentions = useMentionPicker({ text, communitySlug: slug });
  const draft = usePostDraft({
    userId,
    target: `new:${slug}`,
    base: "",
    text: text.value,
    mentions: text.mentions,
    restore: text.restore,
  });
  // A post carries pictures (up to 4), a video, a GIF or a poll, never two
  // kinds.
  const pictures = usePictureUploads();
  const imageButton = useRef<HTMLButtonElement>(null);
  const pollButton = useRef<HTMLButtonElement>(null);
  const [gif, setGif] = useState<PickedGif | null>(null);
  const [poll, setPoll] = useState<PollChoice | null>(null);
  const pollProblemNow = poll ? pollProblem(poll.options) : null;
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
    text.restore("");
    draft.clear();
  };

  const createPost = api.feed.createPost.useMutation({
    onSuccess: () => {
      posted();
      pictures.clear();
      setGif(null);
      setPoll(null);
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
      mentions: text.mentionIds,
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
  // A picture that did not upload is retried or removed before posting;
  // a poll needs every answer filled in, none twice.
  const blocked = pictures.failed || pollProblemNow !== null;

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
      mentions: text.mentionIds,
      images: pictures.count > 0 ? pictures.choices() : undefined,
      gifId: gif?.giphyId,
      poll: poll
        ? { options: poll.options.map((o) => o.trim()), days: poll.days }
        : undefined,
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
        mentions={mentions}
        label={poll ? te("pollQuestion") : t("composePlaceholder")}
        placeholder={poll ? te("pollQuestion") : t("composePlaceholder")}
        onImageFiles={
          videoFile || poll || pictures.room <= 0 ? undefined : addImageFiles
        }
        imageRefusal={
          videoFile || poll ? te("oneMediaOnly") : te("tooManyPictures")
        }
        onSubmitShortcut={submit}
        attachments={
          videoFile || pictures.count > 0 || gif || poll ? (
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
              {poll ? (
                <PollBuilder
                  value={poll}
                  onChange={setPoll}
                  onRemove={() => {
                    setPoll(null);
                    // The poll box is gone: keep keyboard focus in the form.
                    requestAnimationFrame(() => pollButton.current?.focus());
                  }}
                  autoFocus
                />
              ) : null}
            </>
          ) : null
        }
        tools={
          <>
            {videoFile || poll ? null : (
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
            {videoFile || poll ? null : (
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
            {pictures.count > 0 || gif || videoFile || poll ? null : (
              <ToolbarButton
                label={tv("add")}
                icon={<Film aria-hidden="true" className="size-4" />}
                disabled={isUploading}
                onClick={() => videoInputRef.current?.click()}
              />
            )}
            {pictures.count > 0 || gif || videoFile || poll ? null : (
              <ToolbarButton
                ref={pollButton}
                label={te("addPoll")}
                icon={<ChartBar aria-hidden="true" className="size-4" />}
                disabled={isUploading}
                onClick={() => setPoll(emptyPoll())}
              />
            )}
            <EmojiPickerButton onPick={text.insert} />
            <MentionButton text={text} />
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
          pictures.failed ? (
            <p className="text-destructive text-xs">{te("fixPictures")}</p>
          ) : canAnnounce && mentionsEveryone(content) ? (
            <p className="text-foreground text-xs font-medium">
              {te("everyoneWillBeNotified")}
            </p>
          ) : poll && !content.trim() ? (
            <p className="text-muted-foreground text-xs">
              {te("pollAskQuestion")}
            </p>
          ) : pollProblemNow === "empty" ? (
            <p className="text-muted-foreground text-xs">
              {te("pollFillAnswers")}
            </p>
          ) : (pictures.count > 0 || gif || videoFile) && !content.trim() ? (
            <p className="text-muted-foreground text-xs">
              {te("addWordsToPost")}
            </p>
          ) : draft.restored ? (
            <DraftNotice
              onDiscard={() => {
                text.restore("");
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
