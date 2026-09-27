import { isUploadId } from "@/lib/video-rules";

/**
 * Limits, types and names for files uploaded into classroom lessons (spec
 * 2026-09-27 §4, §7). Pure, so the browser (before uploading) and the server
 * (before trusting an upload) use the same rules and can never disagree.
 */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MATERIAL_UPLOADS_PER_DAY = 30;
export const MATERIAL_TITLE_MAX = 200;
export const MATERIAL_FILE_NAME_MAX = 255;

/**
 * Allowed file types: extension → the Content-Type we store and serve. The
 * server derives the type from the extension; the browser never chooses it,
 * and the upload grant only accepts exactly this type.
 */
export const MATERIAL_FILE_TYPES = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  key: "application/vnd.apple.keynote",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

export type MaterialExtension = keyof typeof MATERIAL_FILE_TYPES;

/** For `<input type="file" accept>`. */
export const MATERIAL_ACCEPT = Object.keys(MATERIAL_FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const MATERIAL_KINDS = ["file"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const MATERIAL_STATUSES = ["uploading", "ready", "failed"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];
export const MATERIAL_VISIBILITIES = ["members", "preview"] as const;
export type MaterialVisibility = (typeof MATERIAL_VISIBILITIES)[number];

/** Names for the admin panel (members see translated copy instead). */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  file: "File",
};
export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  uploading: "Uploading",
  ready: "Ready",
  failed: "Failed",
};
export const MATERIAL_VISIBILITY_LABELS: Record<MaterialVisibility, string> = {
  members: "Members only",
  preview: "Free preview",
};

export function isMaterialExtension(value: string): value is MaterialExtension {
  return Object.prototype.hasOwnProperty.call(MATERIAL_FILE_TYPES, value);
}

/**
 * The allowed extension of a file name (after the last dot, any case), or
 * null. `notes.pdf.exe` is "exe", so it is refused; a dot-file such as
 * `.pdf` has no name and is refused too.
 */
export function fileExtensionOf(fileName: string): MaterialExtension | null {
  const name = fileName.trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return isMaterialExtension(ext) ? ext : null;
}

export function contentTypeFor(extension: MaterialExtension): string {
  return MATERIAL_FILE_TYPES[extension];
}

/** Only PDFs are shown inside the lesson; everything else is a download. */
export function isInlinePreviewable(extension: string): boolean {
  return extension === "pdf";
}

/** "PDF", "PPTX" — the short type label on file cards. */
export function fileTypeLabel(extension: string): string {
  return extension.toUpperCase();
}

/** A file's default title: its name without the extension, tidied. */
export function titleFromFileName(fileName: string): string {
  const name = fileName.trim();
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/\s+/g, " ")
    .trim();
  return (base || "File").slice(0, MATERIAL_TITLE_MAX);
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** The S3 key for one uploaded file. Throws on ids that could escape their folder. */
export function materialObjectKey(input: {
  communityId: string;
  courseId: number;
  uploadId: string;
  ext: string;
}): string {
  if (!isUploadId(input.uploadId)) throw new Error("invalid upload id");
  if (!SAFE_SEGMENT.test(input.communityId)) {
    throw new Error("invalid community id");
  }
  if (!Number.isSafeInteger(input.courseId) || input.courseId <= 0) {
    throw new Error("invalid course id");
  }
  if (!isMaterialExtension(input.ext)) throw new Error("invalid extension");
  return `private/classroom/${input.communityId}/${input.courseId}/${input.uploadId}.${input.ext}`;
}

/**
 * The name a downloaded file is saved under: the title (without control
 * characters or path separators) plus the stored extension, never doubled.
 */
export function downloadFileName(title: string, ext: string): string {
  const cleaned = Array.from(title, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 || ch === "/" || ch === "\\" ? " " : ch;
  }).join("");
  const base = cleaned
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MATERIAL_TITLE_MAX)
    .trim();
  const suffix = `.${ext}`;
  const stem = base.toLowerCase().endsWith(suffix.toLowerCase())
    ? base.slice(0, -suffix.length).trim()
    : base;
  return `${stem || "file"}${suffix}`;
}

const UNITS = ["KB", "MB", "GB", "TB"] as const;

/** "512 B", "1.5 KB", "200 MB", "1.2 GB" (1024-based, one decimal under 10). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${Math.max(0, Math.round(bytes || 0))} B`;
  }
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${UNITS[unit] ?? "TB"}`;
}
