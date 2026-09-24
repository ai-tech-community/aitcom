"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { Film, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isCommunityVideosEnabled } from "@/lib/community-videos-flag";
import type { VideoVisibility } from "@/lib/video-rules";
import { useVideoPost } from "./use-video-post";
import { VideoAttachment } from "./video-attachment";

interface PostComposerProps {
  slug: string;
  canPost: boolean;
}

export function PostComposer({ slug, canPost }: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const tc = useTranslations("common");
  const tv = useTranslations("communities.video");
  const utils = api.useUtils();
  const [content, setContent] = useState("");
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

  const { data: topics } = api.topics.list.useQuery({ communitySlug: slug });

  const createPost = api.feed.createPost.useMutation({
    onSuccess: () => {
      toast.success(t("postCreated"));
      setContent("");
      setImageUrl(null);
      void utils.feed.getFeed.invalidate();
      void utils.feed.getActivity.invalidate({ communitySlug: slug });
    },
    onError: () => {
      toast.error(t("toastCreateError"));
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", "feed post image");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");

      const data = (await res.json()) as { url: string };
      setImageUrl(data.url);
    } catch {
      toast.error(tc("uploadFailed"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    toast.success(t("postCreated"));
    setContent("");
    setVideoFile(null);
    setVisibility("community");
  };

  const handleRetry = () => {
    if (!videoFile || !content.trim() || videoBusy) return;
    void submitVideo(videoFile);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border space-y-3 rounded-lg border p-4"
    >
      <Textarea
        placeholder={t("composePlaceholder")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        className="resize-none"
      />

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
        <div className="relative inline-block">
          <Image
            src={imageUrl}
            alt="Preview"
            width={192}
            height={192}
            className="max-h-48 rounded-lg object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 size-6"
            onClick={() => setImageUrl(null)}
            aria-label={t("removeImage")}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* A post carries one image or one video, never both. */}
          {videoFile ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 size-4" />
              )}
              {t("addImage")}
            </Button>
          )}

          {isCommunityVideosEnabled() && !imageUrl && !videoFile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              onClick={() => videoInputRef.current?.click()}
            >
              <Film className="mr-1.5 size-4" />
              {tv("add")}
            </Button>
          ) : null}

          {/* One topic is no choice; the select appears once there are two. */}
          {topics && topics.length > 1 ? (
            <select
              value={topicSlug}
              onChange={(e) => setTopicSlug(e.target.value)}
              className="border-border bg-background rounded-md border px-2 py-1 text-sm"
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
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={!content.trim() || createPost.isPending || videoBusy}
        >
          {createPost.isPending || videoBusy ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : null}
          {t("post")}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
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
