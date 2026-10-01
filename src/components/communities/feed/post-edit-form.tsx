"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChartBar,
  Film,
  ImagePlus,
  Link2,
  Loader2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { firstLink } from "@/lib/links";
import { mentionsEveryone, type PostMention } from "@/lib/post-mentions";
import {
  pollProblem,
  type FeedPollView,
  type PollChoice,
} from "@/lib/poll-rules";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import type { VideoVisibility } from "@/lib/video-rules";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";
import { MediaPreview } from "./media-preview";
import { FeedImageUploadError, uploadFeedImage } from "./upload-feed-image";
import { DraftNotice } from "./editor/draft-notice";
import { EmojiPickerButton } from "./editor/emoji-picker-button";
import { FormatButtons } from "./editor/format-buttons";
import { TopicSelect } from "./editor/topic-select";
import { GifPickerButton, type PickedGif } from "./editor/gif-picker-button";
import type { FeedGifView } from "./feed-gif";
import { MAX_PICTURES, PictureAttachments } from "./editor/picture-attachments";
import { MentionButton, useMentionPicker } from "./editor/mention-picker";
import { CurrentPoll, emptyPoll, PollBuilder } from "./editor/poll-builder";
import { PostEditor } from "./editor/post-editor";
import {
  SEND_SHORTCUTS,
  ShortcutHint,
  ToolbarButton,
} from "./editor/toolbar-button";
import { usePostDraft } from "./editor/use-post-draft";
import { usePostText } from "./editor/use-post-text";

/**
 * One picture in an edited post: one it already shows (`id`), or one just
 * picked (`file`), which stays on the device until Save, so cancelling
 * never leaves an uploaded file behind.
 */
type EditPicture = {
  key: string;
  id?: number;
  file?: File;
  src: string;
  alt: string;
};

/** What the post will carry after the edit. */
type MediaEdit =
  | { kind: "keep" }
  | { kind: "none" }
  | { kind: "pictures"; items: EditPicture[] }
  | { kind: "video"; file: File }
  | { kind: "gif"; gif: PickedGif }
  | { kind: "poll"; poll: PollChoice };

export type EditablePost = {
  id: number;
  content: string;
  imageUrl?: string | null;
  images?: { id: number; url: string; alt: string }[] | null;
  visibility?: VideoVisibility | null;
  video?: { thumbnailUrl: string | null } | null;
  gif?: FeedGifView | null;
  topicSlug?: string | null;
  linkPreview?: {
    url?: string | null;
    title?: string | null;
    siteName?: string | null;
    hidden?: boolean | null;
  } | null;
  /** Set while a moderator reviews a report: the media stays as it is. */
  hiddenAt?: string | null;
  /** Whom the post mentions now. */
  mentions?: PostMention[] | null;
  /** The post's poll, with its votes. */
  poll?: FeedPollView | null;
  /** When the post's "@everyone" went out (it goes out only when shared). */
  announcedAt?: string | null;
};

/**
 * Editing a post: its text and its media, with the composer's controls.
 * A post carries pictures (up to 4), a video or a GIF, never two kinds. Its audience is fixed
 * after posting, so a new video goes to the same audience; a public post
 * whose video is removed becomes community-only (only video posts may be
 * public), and the form says so before saving. Nothing changes until Save.
 */
export function PostEditForm({
  post,
  userId,
  communitySlug,
  canAnnounce = false,
  onSaved,
  onCancel,
}: {
  post: EditablePost;
  /** The author; their unsent edit is kept per post. */
  userId: string;
  communitySlug: string;
  /** May announce with "@everyone": told an edit never announces. */
  canAnnounce?: boolean;
  /** After a successful save (refresh the feed, close the form). */
  onSaved: () => void;
  /** The member left without saving. */
  onCancel: () => void;
}) {
  const t = useTranslations("communities.feed");
  const tv = useTranslations("communities.video");
  const te = useTranslations("communities.feed.editor");
  const utils = api.useUtils();
  const text = usePostText(post.content, post.mentions ?? []);
  const mentions = useMentionPicker({ text, communitySlug });
  const content = text.value;
  const draft = usePostDraft({
    userId,
    target: `edit:${post.id}`,
    base: post.content,
    text: text.value,
    mentions: text.mentions,
    restore: text.restore,
  });
  const [media, setMedia] = useState<MediaEdit>({ kind: "keep" });
  const initialTopic = post.topicSlug ?? "general";
  const [topicSlug, setTopicSlug] = useState(initialTopic);
  const { data: topics } = api.topics.list.useQuery({ communitySlug });
  const initiallyHidden = Boolean(post.linkPreview?.hidden);
  const [previewHidden, setPreviewHidden] = useState(initiallyHidden);
  // The stored preview belongs to one link: offer to hide it only while
  // the text being edited still leads with that link, and only when the
  // post will carry no media (the card shows a preview only then).
  const previewLink = firstLink(text.value);
  /** Topic and preview changes, sent only when the member made them. */
  const details = {
    ...(topicSlug === initialTopic ? {} : { topicSlug }),
    ...(previewHidden === initiallyHidden
      ? {}
      : { linkPreviewHidden: previewHidden }),
  };
  const [isUploading, setIsUploading] = useState(false);
  const previews = useRef(new Set<string>());
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const pollButton = useRef<HTMLButtonElement>(null);
  const videoPost = useVideoPost(communitySlug);
  const audience: VideoVisibility =
    post.visibility === "public" ? "public" : "community";
  const hadGif = Boolean(post.gif?.mp4Url);
  const currentPictures: EditPicture[] = (post.images ?? []).map((image) => ({
    key: `current-${image.id}`,
    id: image.id,
    src: image.url,
    alt: image.alt,
  }));
  const hadPictures = currentPictures.length > 0;
  // A legacy post shows a picture by URL only; it can be removed or
  // replaced, not edited.
  const hadLegacyImage = !hadPictures && Boolean(post.imageUrl);
  const hadPoll = Boolean(post.poll);
  const pollVotes = post.poll?.totalVotes ?? 0;
  // Votes were cast for the poll's words: they stay until it is taken off.
  const pollAnswersFixed = pollVotes > 0 || Boolean(post.poll?.closed);
  const hadMedia =
    hadPictures || hadLegacyImage || Boolean(post.video) || hadGif || hadPoll;
  const mediaLocked = Boolean(post.hiddenAt);

  // Free the device previews of picked pictures when the form goes away.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const movedTo =
    topicSlug === initialTopic
      ? null
      : (topics?.find((topic) => topic.slug === topicSlug)?.label ?? topicSlug);

  const editPost = api.feed.editPost.useMutation({
    onSuccess: () => {
      // The reels strip is not part of the feed the card refreshes, and a
      // removed video's files are already gone.
      void utils.feed.getReels.invalidate({ communitySlug });
      toast.success(
        movedTo ? te("movedToTopic", { topic: movedTo }) : t("postEdited"),
      );
      draft.clear();
      onSaved();
    },
    onError: (error) =>
      toast.error(
        error.data?.code === "TOO_MANY_REQUESTS"
          ? te("gifBusy")
          : error.data?.code === "BAD_REQUEST" && media.kind === "gif"
            ? te("gifGone")
            : error.data?.code === "CONFLICT" ||
                error.data?.code === "FORBIDDEN"
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

  const showsOldImage = media.kind === "keep" && hadLegacyImage;
  const showsOldVideo = media.kind === "keep" && Boolean(post.video);
  const showsOldGif = media.kind === "keep" && hadGif;
  const showsOldPoll = media.kind === "keep" && hadPoll;
  const pollProblemNow =
    media.kind === "poll" ? pollProblem(media.poll.options) : null;
  // Saving takes the poll off (another kind of media, or none), votes too.
  const losesVotes = hadPoll && pollVotes > 0 && media.kind !== "keep";
  const hasMedia = media.kind === "keep" ? hadMedia : media.kind !== "none";
  const hasPreview =
    !hasMedia && previewLink !== null && post.linkPreview?.url === previewLink;
  const losesPublic =
    audience === "public" &&
    Boolean(post.video) &&
    (media.kind === "none" ||
      media.kind === "pictures" ||
      media.kind === "gif" ||
      media.kind === "poll");

  /** The pictures the post will carry, before any change made here. */
  const pictures: EditPicture[] =
    media.kind === "pictures"
      ? media.items
      : media.kind === "keep"
        ? currentPictures
        : [];
  const pictureRoom = MAX_PICTURES - pictures.length;

  const setPictures = (items: EditPicture[]) => {
    setMedia(items.length > 0 ? { kind: "pictures", items } : { kind: "none" });
  };

  const addPictureFiles = (files: File[]) => {
    videoPost.reset();
    const taken = files.slice(0, Math.max(0, pictureRoom));
    if (taken.length < files.length) toast.error(te("tooManyPictures"));
    const added = taken.map((file) => {
      const src = URL.createObjectURL(file);
      previews.current.add(src);
      return { key: crypto.randomUUID(), file, src, alt: "" };
    });
    setPictures([...pictures, ...added]);
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) addPictureFiles(files);
  };

  const removePicture = (key: string) => {
    setPictures(pictures.filter((item) => item.key !== key));
  };

  const describePicture = (key: string, alt: string) => {
    setPictures(
      pictures.map((item) => (item.key === key ? { ...item, alt } : item)),
    );
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

  /**
   * Leaves the edit. "Discard changes" throws the text away; Escape only
   * closes the form, so an accidental press keeps the draft for next time.
   */
  const cancel = ({ discard }: { discard: boolean }) => {
    if (videoPost.state.step === "posting") return;
    videoPost.cancel();
    if (discard) draft.clear();
    onCancel();
  };

  const save = async () => {
    const caption = content.trim();
    if (
      !caption ||
      text.tooLong ||
      busy ||
      videoRefused ||
      pollProblemNow !== null
    ) {
      return;
    }
    if (media.kind === "video") {
      const ok = await videoPost.post({
        file: media.file,
        caption,
        mentions: text.mentionIds,
        visibility: audience,
        replacePostId: post.id,
        details,
      });
      if (!ok) return;
      toast.success(
        movedTo ? te("movedToTopic", { topic: movedTo }) : t("postEdited"),
      );
      draft.clear();
      onSaved();
      return;
    }
    let change:
      | { kind: "keep" }
      | { kind: "none" }
      | { kind: "images"; images: { id: number; alt: string }[] }
      | { kind: "gif"; giphyId: string }
      | { kind: "poll"; poll: PollChoice };
    if (media.kind === "pictures") {
      // Upload new pictures one by one, keeping each one's id as it lands,
      // so a failed save or upload never uploads the others again.
      const items = [...media.items];
      setIsUploading(true);
      try {
        for (const [index, item] of items.entries()) {
          if (item.id !== undefined || !item.file) continue;
          const uploaded = await uploadFeedImage(item.file);
          items[index] = { ...item, id: uploaded.id, file: undefined };
        }
      } catch (error) {
        setMedia({ kind: "pictures", items });
        toast.error(
          error instanceof FeedImageUploadError && error.reason === "tooLarge"
            ? te("pictureTooLarge")
            : te("pictureFailed"),
        );
        return;
      } finally {
        setIsUploading(false);
      }
      setMedia({ kind: "pictures", items });
      change = {
        kind: "images",
        images: items.map((item) => ({ id: item.id!, alt: item.alt.trim() })),
      };
    } else if (media.kind === "gif") {
      change = { kind: "gif", giphyId: media.gif.giphyId };
    } else if (media.kind === "poll") {
      change = {
        kind: "poll",
        poll: {
          options: media.poll.options.map((option) => option.trim()),
          days: media.poll.days,
        },
      };
    } else {
      change = media;
    }
    editPost.mutate({
      postId: post.id,
      communitySlug,
      content: caption,
      mentions: text.mentionIds,
      media: change,
      ...details,
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        // Only an Escape meant for the form itself: the emoji panel sits in
        // a portal, so its own Escape bubbles here too (already handled).
        if (
          e.key !== "Escape" ||
          e.defaultPrevented ||
          !e.currentTarget.contains(e.target as Node)
        ) {
          return;
        }
        e.preventDefault();
        cancel({ discard: false });
      }}
    >
      <PostEditor
        text={text}
        mentions={mentions}
        label={t("editLabel")}
        autoFocus
        onImageFiles={
          mediaLocked || busy || pictureRoom <= 0 ? undefined : addPictureFiles
        }
        imageRefusal={
          mediaLocked
            ? t("mediaLockedWhileReviewed")
            : pictureRoom <= 0
              ? te("tooManyPictures")
              : te("waitForUpload")
        }
        onSubmitShortcut={() => void save()}
        attachments={
          <>
            {mediaLocked ? null : media.kind === "video" ? (
              <VideoAttachment
                file={media.file}
                visibility={audience}
                onRemove={removeMedia}
                onCancel={videoPost.cancel}
                onRetry={() => void save()}
                state={videoPost.state}
              />
            ) : pictures.length > 0 ? (
              <PictureAttachments
                items={pictures}
                onAltChange={describePicture}
                onRemove={removePicture}
                onEmptied={() => imageButton.current?.focus()}
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
            ) : media.kind === "gif" ? (
              <MediaPreview
                src={media.gif.preview.stillUrl}
                alt={media.gif.title || t("gifBadge")}
                badge={t("gifBadge")}
                removeLabel={t("removeGif")}
                onRemove={removeMedia}
                disabled={busy}
              />
            ) : showsOldGif ? (
              <MediaPreview
                src={post.gif?.stillUrl ?? null}
                alt={post.gif?.title ?? t("gifBadge")}
                badge={t("currentGif")}
                removeLabel={t("removeGif")}
                onRemove={removeMedia}
                disabled={busy}
              />
            ) : media.kind === "poll" ? (
              <PollBuilder
                value={media.poll}
                onChange={(poll) => setMedia({ kind: "poll", poll })}
                keepEnd={hadPoll}
                onRemove={() => {
                  // A poll just added goes back to what the post had; the
                  // post's own poll, being changed, comes off.
                  if (hadPoll) removeMedia();
                  else keepCurrent();
                  requestAnimationFrame(() => pollButton.current?.focus());
                }}
                autoFocus
                disabled={busy}
              />
            ) : showsOldPoll && post.poll ? (
              <CurrentPoll
                poll={post.poll}
                onChange={
                  pollAnswersFixed
                    ? undefined
                    : () =>
                        setMedia({
                          kind: "poll",
                          // The changed poll keeps its end unless the
                          // author picks a new one.
                          poll: {
                            options: post.poll!.options.map((o) => o.label),
                            days: null,
                          },
                        })
                }
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
            {!mediaLocked && hadMedia && media.kind !== "keep" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={keepCurrent}
                className="-ml-2"
              >
                <Undo2 aria-hidden="true" className="size-4" />
                {post.video
                  ? t("keepCurrentVideo")
                  : hadGif
                    ? t("keepCurrentGif")
                    : hadPoll
                      ? te("keepCurrentPoll")
                      : hadPictures
                        ? t("keepCurrentPictures")
                        : t("keepCurrentImage")}
              </Button>
            ) : null}
            {mediaLocked ? (
              <p className="text-muted-foreground text-sm">
                {t("mediaLockedWhileReviewed")}
              </p>
            ) : null}
            {hasPreview ? (
              <div className="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Link2 aria-hidden="true" className="size-4 shrink-0" />
                <span role="status" className="min-w-0 flex-1 truncate">
                  {previewHidden
                    ? te("previewHidden")
                    : (post.linkPreview?.title ??
                      post.linkPreview?.siteName ??
                      previewLink)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPreviewHidden(!previewHidden)}
                >
                  {previewHidden ? te("showPreview") : te("removePreview")}
                </Button>
              </div>
            ) : null}
            {/* Always mounted, so screen readers hear the warning when it
                appears (WCAG 4.1.3). Above Save, so it is read first. */}
            <div role="status">
              {losesVotes ? (
                <p className="bg-warning/10 border-warning/30 text-foreground mb-2 flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                  <TriangleAlert
                    aria-hidden="true"
                    className="text-warning mt-0.5 size-4 shrink-0"
                  />
                  {te("pollVotesRemoved", { count: pollVotes })}
                </p>
              ) : null}
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
            {media.kind === "keep" ? null : (
              <p className="text-muted-foreground text-xs">
                {t("mediaChangesOnSave")}
              </p>
            )}
          </>
        }
        tools={
          <>
            {mediaLocked ? null : (
              <>
                <ToolbarButton
                  ref={imageButton}
                  label={
                    pictureRoom <= 0
                      ? te("tooManyPictures")
                      : pictures.length > 0 || !hasMedia
                        ? t("addImage")
                        : t("replaceWithImage")
                  }
                  icon={<ImagePlus aria-hidden="true" className="size-4" />}
                  disabled={busy || pictureRoom <= 0}
                  onClick={() => imageInput.current?.click()}
                />
                <ToolbarButton
                  label={hasMedia ? t("replaceWithVideo") : tv("add")}
                  icon={<Film aria-hidden="true" className="size-4" />}
                  disabled={busy}
                  onClick={() => videoInput.current?.click()}
                />
                <GifPickerButton
                  communitySlug={communitySlug}
                  label={
                    pictures.length > 0
                      ? te("replacePicturesWithGif")
                      : hasMedia
                        ? t("replaceWithGif")
                        : te("gif")
                  }
                  onPick={(gif) => {
                    videoPost.reset();
                    setMedia({ kind: "gif", gif });
                  }}
                  disabled={busy}
                />
                {media.kind === "poll" ? null : (
                  <ToolbarButton
                    ref={pollButton}
                    label={hasMedia ? te("replaceWithPoll") : te("addPoll")}
                    icon={<ChartBar aria-hidden="true" className="size-4" />}
                    disabled={busy}
                    onClick={() => {
                      videoPost.reset();
                      setMedia({ kind: "poll", poll: emptyPoll() });
                    }}
                  />
                )}
              </>
            )}
            <EmojiPickerButton onPick={text.insert} disabled={busy} />
            <MentionButton text={text} disabled={busy} />
            <FormatButtons text={text} disabled={busy} />
            <TopicSelect
              communitySlug={communitySlug}
              value={topicSlug}
              onChange={setTopicSlug}
              disabled={busy}
            />
          </>
        }
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => cancel({ discard: true })}
              disabled={videoPost.state.step === "posting"}
            >
              {t("discardChanges")}
            </Button>
            <ShortcutHint hint={te("saveShortcut")}>
              <Button
                type="submit"
                size="sm"
                disabled={
                  !content.trim() ||
                  text.tooLong ||
                  busy ||
                  videoRefused ||
                  pollProblemNow !== null
                }
                aria-busy={busy}
                aria-keyshortcuts={SEND_SHORTCUTS}
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {t("save")}
              </Button>
            </ShortcutHint>
          </>
        }
        notice={
          canAnnounce && !post.announcedAt && mentionsEveryone(content) ? (
            <p className="text-muted-foreground text-xs">
              {te("everyoneNotInEdits")}
            </p>
          ) : pollProblemNow === "empty" ? (
            <p className="text-muted-foreground text-xs">
              {te("pollFillAnswers")}
            </p>
          ) : draft.restored ? (
            <DraftNotice
              onDiscard={() => {
                text.restore(post.content, post.mentions ?? []);
                draft.clear();
              }}
            />
          ) : null
        }
      />

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
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
