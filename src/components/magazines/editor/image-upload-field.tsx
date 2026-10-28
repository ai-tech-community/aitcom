"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadSharedImage } from "@/lib/upload-shared-image";

/** The words an image field shows; each surface names its own image. */
export type ImageUploadFieldText = {
  label: string;
  hint: string;
  upload: string;
  replace: string;
  remove: string;
  uploading: string;
  failed: string;
};

/**
 * One uploaded image of a magazine (an issue's cover, the magazine's logo):
 * the current image, an Upload / Replace button and Remove.
 *
 * The file input is an implementation detail: it is hidden from the tab
 * order and from screen readers, and the visible button opens it. The
 * button is the field's one control, so it carries the field's name ("Cover,
 * Upload a cover") and its hint.
 */
export function ImageUploadField({
  value,
  onChange,
  text,
  uploadAlt,
  renderPreview,
  onUploadingChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  text: ImageUploadFieldText;
  /** The alt text the upload service stores with the file. */
  uploadAlt: string;
  /** The image as the field shows it; only called with a value. */
  renderPreview: (url: string) => ReactNode;
  /** Lets a form wait for an upload in progress before it saves. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const buttonId = useId();
  const hintId = useId();

  const setUploading = (uploading: boolean) => {
    setIsUploading(uploading);
    onUploadingChange?.(uploading);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadSharedImage(file, uploadAlt));
    } catch {
      toast.error(text.failed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-sm leading-none font-medium">
        {text.label}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {value && renderPreview(value)}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => void handleFile(e)}
          disabled={isUploading}
        />
        <Button
          id={buttonId}
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          aria-labelledby={`${labelId} ${buttonId}`}
          aria-describedby={hintId}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? text.uploading : value ? text.replace : text.upload}
        </Button>
        {value && !isUploading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            {text.remove}
          </Button>
        )}
      </div>
      <p id={hintId} className="text-muted-foreground text-sm">
        {text.hint}
      </p>
    </div>
  );
}
