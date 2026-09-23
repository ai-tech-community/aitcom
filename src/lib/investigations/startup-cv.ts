import { presentText } from "./startups";

export const STARTUP_CV_PURPOSE = "startup_role_applications";

export const STARTUP_CV_MAX_BYTES = 2 * 1024 * 1024;

export const STARTUP_CV_TEXT_MAX = 80_000;

export const STARTUP_CV_TEXT_MIN = 80;

export const STARTUP_CV_FILENAME_MAX = 160;

export const STARTUP_CV_READ_ERROR =
  "Could not read text from that file. Try a .txt export.";

export type StartupCvPublic = {
  fileName: string;
  uploadedAt: string;
  textLength: number;
};

export type StartupCvRecord = StartupCvPublic & {
  textContent: string;
};

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 800));
  let nuls = 0;
  for (const byte of sample) {
    if (byte === 0) nuls += 1;
  }
  return nuls === 0;
}

function unescapePdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdfText(buffer: Buffer): string | null {
  const latin1 = buffer.toString("latin1");
  if (!latin1.startsWith("%PDF")) return null;
  const chunks: string[] = [];
  const pattern = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(latin1)) !== null) {
    const inner = unescapePdfLiteral(match[0]?.slice(1, -1) ?? "");
    if (/[A-Za-z]{3,}/.test(inner)) chunks.push(inner);
  }
  const text = presentText(chunks.join(" ").replace(/\s+/g, " "));
  return text && text.length >= STARTUP_CV_TEXT_MIN ? text : null;
}

export function parseStartupCvFileName(
  value: string | null | undefined,
): string | null {
  const name = presentText(value)?.replace(/[/\\]/g, "");
  if (!name || name.length > STARTUP_CV_FILENAME_MAX) return null;
  return name;
}

export function extractStartupCvText(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): string | null {
  if (buffer.length === 0 || buffer.length > STARTUP_CV_MAX_BYTES) return null;
  const lowerName = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (latin1Pdf(buffer, mime, lowerName)) {
    return clipCvText(extractPdfText(buffer));
  }
  if (!looksLikeText(buffer)) return null;
  if (
    mime.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md")
  ) {
    return clipCvText(presentText(buffer.toString("utf8")));
  }
  return null;
}

function latin1Pdf(buffer: Buffer, mime: string, fileName: string): boolean {
  return (
    mime === "application/pdf" ||
    fileName.endsWith(".pdf") ||
    buffer.subarray(0, 4).toString("latin1") === "%PDF"
  );
}

function clipCvText(text: string | null): string | null {
  if (!text || text.length < STARTUP_CV_TEXT_MIN) return null;
  return text.slice(0, STARTUP_CV_TEXT_MAX);
}
