"use client";

import { useRef, useState } from "react";

/**
 * Uploads a cover image through the shared media endpoint and hands back the
 * stored media id and url. `onError` gets nothing; the caller words it.
 */
export function useCoverUpload({
  alt,
  onUploaded,
  onError,
}: {
  alt: string;
  onUploaded: (media: { id: number; url: string }) => void;
  onError: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("alt", alt);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) throw new Error("upload failed");
      onUploaded((await res.json()) as { id: number; url: string });
    } catch {
      onError();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return {
    inputRef,
    uploading,
    pick: () => inputRef.current?.click(),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void upload(file);
    },
  };
}
