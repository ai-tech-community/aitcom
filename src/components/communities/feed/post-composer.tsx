"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useSiteShell } from "@/components/site-chrome-gate";
import { EmojiPickerButton } from "@/components/composer/emoji-picker-button";
import {
  SEND_SHORTCUTS,
  ShortcutHint,
  ToolbarButton,
} from "@/components/composer/toolbar-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getInitials } from "@/lib/avatar";
import {
  ChartBar,
  CircleAlert,
  Film,
  ImagePlus,
  Loader2,
  SquarePen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { VideoVisibility } from "@/lib/video-rules";
import { pollProblem, type PollChoice } from "@/lib/poll-rules";
import { mentionsEveryone } from "@/lib/post-mentions";
import { mayGoWithoutWords } from "@/lib/feed-post-rules";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";
import { MediaPreview } from "@/components/composer/media-preview";
import { DraftNotice } from "./editor/draft-notice";
import { FormatButtons } from "./editor/format-buttons";
import { TopicSelect } from "./editor/topic-select";
import {
  GifPickerButton,
  type PickedGif,
} from "@/components/composer/gif-picker-button";
import { PictureAttachments } from "./editor/picture-attachments";
import { emptyPoll, PollBuilder } from "./editor/poll-builder";
import { MentionButton, useMentionPicker } from "./editor/mention-picker";
import { PostEditor } from "./editor/post-editor";
import { usePostDraft } from "./editor/use-post-draft";
import { usePictureUploads } from "./editor/use-picture-uploads";
import { usePostText } from "./editor/use-post-text";

export interface PostComposerDisclosure {
  editor: ReactNode;
  editorId: string;
  expanded: boolean;
  toggleDisabled: boolean;
  onToggle: () => void;
  triggerRef: Ref<HTMLButtonElement>;
}

interface PostComposerProps {
  slug: string;
  /** The signed-in member; their unsent draft is kept per community. */
  userId: string;
  canPost: boolean;
  textareaId?: string;
  neutralSubmit?: boolean;
  renderDisclosure?: (disclosure: PostComposerDisclosure) => ReactNode;
  /** May announce with "@everyone" (`canBroadcast`): warned before posting. */
  canAnnounce?: boolean;
  /** Enables the community home disclosure and identifies its destination. */
  home?: {
    communityName: string;
    authorName?: string | null;
    authorImage?: string | null;
  };
}

export function PostComposer({
  slug,
  userId,
  canPost,
  textareaId,
  neutralSubmit = false,
  renderDisclosure,
  canAnnounce = false,
  home,
}: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const te = useTranslations("communities.feed.editor");
  const tv = useTranslations("communities.video");
  const th = useTranslations("redesign.homeFeed");
  const inCommunityShell = useSiteShell() === "community";
  const hasDisclosure = !!home || !!renderDisclosure;
  const editorId = useId();
  const titleId = useId();
  const destinationId = useId();
  const disabledReasonId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
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
    saveImmediately: !!home,
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
  const hasDraft =
    content.trim() !== "" ||
    pictures.count > 0 ||
    gif !== null ||
    poll !== null ||
    videoFile !== null;
  const close = () => {
    returnFocus.current = true;
    setExpanded(false);
  };

  useLayoutEffect(() => {
    if (expanded) {
      text.textareaRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [expanded, text.textareaRef]);

  useLayoutEffect(() => {
    if (publishError && document.activeElement === document.body) {
      retry.current?.focus();
    }
  }, [publishError]);

  const posted = () => {
    toast.success(t("postCreated"));
    text.restore("");
    draft.clear();
    setPublishError(null);
    if (hasDisclosure) close();
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
      const message =
        code === "TOO_MANY_REQUESTS" && gif
          ? te("gifBusy")
          : code === "BAD_REQUEST" && gif
            ? te("gifGone")
            : home
              ? th(content.trim() ? "publishError" : "publishErrorNoText")
              : t("toastCreateError");
      if (home) setPublishError(message);
      else toast.error(message);
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

  const discard = () => {
    text.restore("");
    draft.clear();
    pictures.clear();
    setGif(null);
    setPoll(null);
    removeVideo();
    setTopicSlug("general");
    setPublishError(null);
    close();
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
    if (!videoFile || noWords || videoBusy) return;
    void submitVideo(videoFile);
  };

  const busy = createPost.isPending || videoBusy || isUploading;
  // A picture that did not upload is retried or removed before posting;
  // a poll needs every answer filled in, none twice.
  const blocked = pictures.failed || pollProblemNow !== null;
  // Words are optional with a GIF or described pictures; a video and a
  // poll (its words are the question) need them.
  const wordsOptional = mayGoWithoutWords({
    gif: Boolean(gif),
    pictureAlts: pictures.items.map((item) => item.alt),
  });
  const noWords = content.trim() === "";
  const ready =
    (!noWords || wordsOptional) && !text.tooLong && !busy && !blocked;
  const progressLabel = th(isUploading ? "preparingPost" : "posting");
  let disabledReason: string | undefined;
  if (home && !ready) {
    if (busy) disabledReason = progressLabel;
    else if (pictures.failed) disabledReason = te("fixPictures");
    else if (text.tooLong) disabledReason = te("limitOver");
    else if (noWords && poll) disabledReason = te("pollAskQuestion");
    else if (noWords && videoFile) disabledReason = te("videoNeedsWords");
    else if (noWords && pictures.count > 0)
      disabledReason = te("describeToPostWithoutWords");
    else if (noWords) disabledReason = th("writeSomethingFirst");
    else
      disabledReason = te(
        pollProblemNow === "duplicate" ? "pollDuplicate" : "pollFillAnswers",
      );
  }

  const submit = () => {
    // Waiting for a picture still uploading, so it is not left behind.
    if (!ready) return;
    if (videoFile) {
      setPublishError(null);
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

  const editorLabel = poll
    ? te("pollQuestion")
    : home
      ? th("writePost")
      : t("composePlaceholder");
  const postButton = (
    <Button
      type={disabledReason ? "button" : "submit"}
      size="sm"
      variant={disabledReason ? "secondary" : neutralSubmit ? "ink" : "default"}
      className={
        home
          ? "min-h-11 border border-transparent motion-reduce:transition-none sm:min-h-8"
          : neutralSubmit
            ? "disabled:bg-secondary disabled:text-muted-foreground min-h-11 disabled:opacity-100 sm:min-h-8"
            : undefined
      }
      data-feed-submit=""
      disabled={!home && !ready}
      aria-disabled={disabledReason ? true : undefined}
      aria-describedby={disabledReason ? disabledReasonId : undefined}
      aria-busy={busy}
      aria-keyshortcuts={SEND_SHORTCUTS}
    >
      {busy && !home ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : null}
      {home && busy ? progressLabel : t("post")}
    </Button>
  );

  const topicPicker = (
    <TopicSelect
      communitySlug={slug}
      value={topicSlug}
      onChange={setTopicSlug}
      redesigned={inCommunityShell || !!home}
      disabled={home ? busy : undefined}
      className={home ? "min-h-11 sm:min-h-8" : undefined}
    />
  );

  const entry =
    home && !renderDisclosure ? (
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        hidden={expanded}
        aria-controls={editorId}
        aria-expanded={expanded}
        aria-label={th(hasDraft ? "continueDraft" : "startPost")}
        onClick={() => setExpanded(true)}
        className="h-auto min-h-16 w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-left whitespace-normal shadow-none motion-reduce:transition-none sm:px-4"
      >
        <Avatar aria-hidden="true" className="size-9 shrink-0">
          {home.authorImage ? (
            <AvatarImage src={home.authorImage} alt="" />
          ) : null}
          <AvatarFallback>{getInitials(home.authorName ?? "")}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="text-base font-semibold">
            {th(hasDraft ? "continueDraft" : "startPost")}
          </span>
          {hasDraft ? (
            <span className="text-muted-foreground text-sm">
              {th("unsentDraft")}
            </span>
          ) : null}
        </span>
        <span className="bg-primary text-foreground dark:text-card grid size-9 shrink-0 place-items-center rounded-md">
          <SquarePen aria-hidden="true" className="size-4" />
        </span>
      </Button>
    ) : null;

  const editor = (
    <form
      id={hasDisclosure ? editorId : undefined}
      aria-labelledby={home ? titleId : undefined}
      hidden={hasDisclosure && !expanded}
      data-home-composer={home ? "" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {home ? (
        <div className="border-border flex flex-wrap items-start justify-between gap-3 rounded-t-lg border border-b-0 px-3 pt-2.5 pb-3 sm:px-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {th("newPost")}
            </h2>
            <p
              id={destinationId}
              className="text-muted-foreground text-sm wrap-break-word"
            >
              {th.rich("postingIn", {
                name: home.communityName,
                destination: (name) => (
                  <strong className="text-foreground font-medium">
                    <bdi>{name}</bdi>
                  </strong>
                ),
              })}
            </p>
          </div>
          {!renderDisclosure ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 sm:size-9"
              aria-label={th("closeComposer")}
              onClick={close}
              disabled={busy}
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 empty:hidden">
            {topicPicker}
            {hasDraft && !publishError ? (
              <p role="status" className="text-muted-foreground text-sm">
                {th("unsentDraft")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <PostEditor
        text={text}
        mentions={mentions}
        textareaId={textareaId}
        label={editorLabel}
        placeholder={editorLabel}
        inlineComposer={!!home}
        descriptionId={home ? destinationId : undefined}
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
                altRequired={noWords}
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
            <div className="contents" data-post-insert-tools="">
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
                  label={
                    gif
                      ? t("replaceWithGif")
                      : pictures.count > 0
                        ? te("replacePicturesWithGif")
                        : undefined
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
            </div>
            <div className="contents" data-post-format-tools="">
              <FormatButtons text={text} />
            </div>
            {!home ? (
              <div className="contents" data-post-topic="">
                {topicPicker}
              </div>
            ) : null}
          </>
        }
        actions={
          publishError ? null : home ? (
            <Tooltip>
              <TooltipTrigger asChild>{postButton}</TooltipTrigger>
              <TooltipContent
                className="motion-reduce:animate-none"
                sideOffset={4}
              >
                {disabledReason ?? te("submitShortcut")}
              </TooltipContent>
              {disabledReason ? (
                <span id={disabledReasonId} className="sr-only">
                  {disabledReason}
                </span>
              ) : null}
            </Tooltip>
          ) : (
            <ShortcutHint hint={te("submitShortcut")}>
              {postButton}
            </ShortcutHint>
          )
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
          ) : noWords && pictures.count > 0 ? (
            <p className="text-muted-foreground text-xs">
              {te("describeToPostWithoutWords")}
            </p>
          ) : noWords && videoFile ? (
            <p className="text-muted-foreground text-xs">
              {te("videoNeedsWords")}
            </p>
          ) : draft.restored && !publishError ? (
            <DraftNotice
              onDiscard={() => {
                text.restore("");
                draft.clear();
              }}
            />
          ) : null
        }
      />
      {publishError ? (
        <div className="border-destructive/30 bg-card mt-2 flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <p
            role="alert"
            className="text-destructive flex min-w-0 items-start gap-2 text-sm wrap-break-word"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{publishError}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              ref={retry}
              type="submit"
              size="sm"
              variant={ready ? "ink" : "secondary"}
              className="min-h-11 border border-transparent sm:min-h-8"
              data-feed-submit=""
              aria-disabled={!ready}
              aria-busy={busy}
            >
              {busy
                ? th(isUploading ? "preparingPost" : "posting")
                : th("retryPost")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-8"
              onClick={discard}
              disabled={busy}
            >
              {te("discardDraft")}
            </Button>
          </div>
        </div>
      ) : null}

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

  if (renderDisclosure) {
    return renderDisclosure({
      editor,
      editorId,
      expanded,
      toggleDisabled: expanded && busy,
      onToggle: expanded ? close : () => setExpanded(true),
      triggerRef: trigger,
    });
  }

  return home ? (
    <>
      {entry}
      {editor}
    </>
  ) : (
    editor
  );
}
