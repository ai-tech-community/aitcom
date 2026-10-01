"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { uploadFeedImage, type UploadedFeedImage } from "../upload-feed-image";
import { MAX_PICTURES, type PictureItem } from "./picture-attachments";

type Upload = {
  key: string;
  previewUrl: string;
  alt: string;
  uploaded: UploadedFeedImage | null;
};

/**
 * Pictures for a new post, uploaded as soon as they are picked (so posting
 * is quick) and shown from the device meanwhile. Keeps at most
 * MAX_PICTURES; `add` answers how many it had to leave out. A failed
 * upload drops its picture and calls `onFailed`.
 */
export function usePictureUploads({ onFailed }: { onFailed: () => void }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const previews = useRef(new Set<string>());

  // Free the device previews when the form goes away.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const forget = (upload: Upload) => {
    URL.revokeObjectURL(upload.previewUrl);
    previews.current.delete(upload.previewUrl);
  };

  const add = useCallback(
    (files: File[], room: number): number => {
      const taken = files.slice(0, Math.max(0, room));
      for (const file of taken) {
        const key = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        previews.current.add(previewUrl);
        setUploads((list) => [
          ...list,
          { key, previewUrl, alt: "", uploaded: null },
        ]);
        uploadFeedImage(file).then(
          (uploaded) =>
            setUploads((list) =>
              list.map((u) => (u.key === key ? { ...u, uploaded } : u)),
            ),
          () => {
            setUploads((list) => {
              const failed = list.find((u) => u.key === key);
              if (failed) forget(failed);
              return list.filter((u) => u.key !== key);
            });
            onFailed();
          },
        );
      }
      return files.length - taken.length;
    },
    [onFailed],
  );

  const remove = useCallback((key: string) => {
    setUploads((list) => {
      const gone = list.find((u) => u.key === key);
      if (gone) forget(gone);
      return list.filter((u) => u.key !== key);
    });
  }, []);

  const setAlt = useCallback((key: string, alt: string) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, alt } : u)));
  }, []);

  const clear = useCallback(() => {
    setUploads((list) => {
      list.forEach(forget);
      return [];
    });
  }, []);

  const items: PictureItem[] = uploads.map((u) => ({
    key: u.key,
    src: u.previewUrl,
    alt: u.alt,
    uploading: !u.uploaded,
  }));

  return {
    items,
    count: uploads.length,
    room: MAX_PICTURES - uploads.length,
    uploading: uploads.some((u) => !u.uploaded),
    add,
    remove,
    setAlt,
    clear,
    /** What the post is sent with, once every upload is done. */
    choices: () =>
      uploads.flatMap((u) =>
        u.uploaded ? [{ id: u.uploaded.id, alt: u.alt.trim() }] : [],
      ),
  };
}
