"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PostComposerProps {
  slug: string;
  canPost: boolean;
}

export function PostComposer({ slug, canPost }: PostComposerProps) {
  const t = useTranslations("communities.feed");
  const utils = api.useUtils();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createPost = api.feed.createPost.useMutation({
    onSuccess: () => {
      toast.success(t("postCreated"));
      setContent("");
      setImageUrl(null);
      void utils.feed.getFeed.invalidate();
    },
    onError: () => {
      toast.error("Failed to create post");
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

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json() as { url: string };
      setImageUrl(data.url);
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createPost.mutate({
      communitySlug: slug,
      content: content.trim(),
      imageUrl: imageUrl ?? undefined,
    });
  };

  if (!canPost) return null;

  return (
    <form onSubmit={handleSubmit} className="border-border rounded-lg border p-4 space-y-3">
      <Textarea
        placeholder={t("composePlaceholder")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        className="resize-none"
      />

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
            className="absolute right-1 top-1 size-6"
            onClick={() => setImageUrl(null)}
            aria-label={t("removeImage")}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
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

        <Button
          type="submit"
          size="sm"
          disabled={!content.trim() || createPost.isPending}
        >
          {createPost.isPending ? (
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
    </form>
  );
}
