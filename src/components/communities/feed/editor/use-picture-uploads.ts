"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FeedImageUploadError,
  uploadFeedImage,
  type UploadedFeedImage,
} from "../upload-feed-image";
import { MAX_PICTURES, type PictureItem } from "./picture-attachments";

type Upload = {
  key: string;
  file: File;
  previewUrl: string;
  alt: string;
  uploaded: UploadedFeedImage | null;
  failed: "tooLarge" | "failed" | null;
};

/** What `snapshot` hands back to `restore` (an undo). */
export type PictureUploadsSnapshot = readonly Upload[];

/**
 * Pictures for a new post, uploaded as soon as they are picked (so posting
 * is quick) and shown from the device meanwhile. Keeps at most
 * MAX_PICTURES, counted as they are added (two quick pastes cannot get
 * past it); `add` answers how many it had to leave out. A picture that
 * fails to upload stays, with the reason, until it is retried or removed.
 */
export function usePictureUploads() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const count = useRef(0);
  const previews = useRef(new Set<string>());

  // Free the device previews when the form goes away. (They are kept until
  // then, so a cleared set of pictures can be brought back.)
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const change = (key: string, patch: Partial<Upload>) =>
    setUploads((list) =>
      list.map((u) => (u.key === key ? { ...u, ...patch } : u)),
    );

  const start = useCallback((key: string, file: File) => {
    uploadFeedImage(file).then(
      (uploaded) => change(key, { uploaded, failed: null }),
      (error: unknown) =>
        change(key, {
          failed:
            error instanceof FeedImageUploadError ? error.reason : "failed",
        }),
    );
  }, []);

  const add = useCallback(
    (files: File[]): number => {
      const taken = files.slice(0, Math.max(0, MAX_PICTURES - count.current));
      count.current += taken.length;
      const added = taken.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previews.current.add(previewUrl);
        return {
          key: crypto.randomUUID(),
          file,
          previewUrl,
          alt: "",
          uploaded: null,
          failed: null,
        };
      });
      setUploads((list) => [...list, ...added]);
      for (const upload of added) start(upload.key, upload.file);
      return files.length - taken.length;
    },
    [start],
  );

  const retry = useCallback(
    (key: string) => {
      const upload = uploads.find((u) => u.key === key);
      if (!upload) return;
      change(key, { failed: null });
      start(key, upload.file);
    },
    [uploads, start],
  );

  const remove = useCallback((key: string) => {
    setUploads((list) => list.filter((u) => u.key !== key));
    count.current = Math.max(0, count.current - 1);
  }, []);

  const setAlt = useCallback((key: string, alt: string) => {
    change(key, { alt });
  }, []);

  const clear = useCallback(() => {
    setUploads([]);
    count.current = 0;
  }, []);

  const snapshot = useCallback(
    (): PictureUploadsSnapshot => uploads,
    [uploads],
  );

  const restore = useCallback((saved: PictureUploadsSnapshot) => {
    setUploads([...saved]);
    count.current = saved.length;
  }, []);

  const items: PictureItem[] = uploads.map((u) => ({
    key: u.key,
    src: u.previewUrl,
    alt: u.alt,
    uploading: !u.uploaded && !u.failed,
    failed: u.failed ?? undefined,
  }));

  return {
    items,
    count: uploads.length,
    room: MAX_PICTURES - uploads.length,
    uploading: uploads.some((u) => !u.uploaded && !u.failed),
    failed: uploads.some((u) => u.failed),
    add,
    retry,
    remove,
    setAlt,
    clear,
    snapshot,
    restore,
    /** What the post is sent with, once every upload is done. */
    choices: () =>
      uploads.flatMap((u) =>
        u.uploaded ? [{ id: u.uploaded.id, alt: u.alt.trim() }] : [],
      ),
  };
}
