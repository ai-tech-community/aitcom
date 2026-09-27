import { describe, expect, it } from "vitest";

import {
  MATERIAL_ACCEPT,
  MATERIAL_FILE_TYPES,
  MAX_FILE_BYTES,
  contentTypeFor,
  downloadFileName,
  fileExtensionOf,
  fileTypeLabel,
  formatBytes,
  isInlinePreviewable,
  materialObjectKey,
  titleFromFileName,
} from "./material-rules";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

describe("fileExtensionOf", () => {
  it.each([
    ["Slides.PDF", "pdf"],
    ["deck.pptx", "pptx"],
    ["Book.XLSX", "xlsx"],
    ["talk.key", "key"],
    ["photo.JPEG", "jpeg"],
    ["  notes.docx  ", "docx"],
  ])("accepts %s as %s", (name, ext) => {
    expect(fileExtensionOf(name)).toBe(ext);
  });

  it.each([
    "notes.pdf.exe",
    "archive.tar.gz",
    "page.html",
    "vector.svg",
    ".pdf",
    "trailing.",
    "no-extension",
    "",
    "file.constructor",
  ])("refuses %p", (name) => {
    expect(fileExtensionOf(name)).toBeNull();
  });
});

describe("types and labels", () => {
  it("derives the stored type from the extension only", () => {
    expect(contentTypeFor("pdf")).toBe("application/pdf");
    expect(contentTypeFor("jpg")).toBe("image/jpeg");
    expect(contentTypeFor("key")).toBe("application/vnd.apple.keynote");
    expect(Object.keys(MATERIAL_FILE_TYPES)).toHaveLength(14);
  });

  it("lists every extension for the file picker", () => {
    expect(MATERIAL_ACCEPT).toBe(
      ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.key,.zip,.png,.jpg,.jpeg,.webp",
    );
  });

  it("previews only PDFs inline", () => {
    expect(isInlinePreviewable("pdf")).toBe(true);
    expect(isInlinePreviewable("png")).toBe(false);
    expect(isInlinePreviewable("zip")).toBe(false);
  });

  it("labels a type in capitals", () => {
    expect(fileTypeLabel("pptx")).toBe("PPTX");
  });

  it("caps a file at 200 MB", () => {
    expect(MAX_FILE_BYTES).toBe(209_715_200);
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and tidies spaces", () => {
    expect(titleFromFileName("Week 1 slides.pdf")).toBe("Week 1 slides");
    expect(titleFromFileName("  My   deck .pptx ")).toBe("My deck");
  });

  it("keeps at most 200 characters", () => {
    expect(titleFromFileName(`${"a".repeat(250)}.pdf`)).toHaveLength(200);
  });
});

describe("materialObjectKey", () => {
  const good = {
    communityId: "c-1",
    courseId: 12,
    uploadId: UPLOAD,
    ext: "pdf",
  };

  it("puts the file under the private classroom prefix", () => {
    expect(materialObjectKey(good)).toBe(
      `private/classroom/c-1/12/${UPLOAD}.pdf`,
    );
  });

  it.each([
    [{ communityId: "../x" }, "invalid community id"],
    [{ communityId: "c/1" }, "invalid community id"],
    [{ communityId: "" }, "invalid community id"],
    [{ courseId: 0 }, "invalid course id"],
    [{ courseId: 1.5 }, "invalid course id"],
    [{ courseId: -3 }, "invalid course id"],
    [{ uploadId: "../../etc/passwd" }, "invalid upload id"],
    [{ uploadId: "not-a-uuid" }, "invalid upload id"],
    [{ ext: "exe" }, "invalid extension"],
    [{ ext: "pdf/../x" }, "invalid extension"],
  ])("refuses an escape attempt %o", (over, message) => {
    expect(() => materialObjectKey({ ...good, ...over })).toThrow(message);
  });
});

describe("downloadFileName", () => {
  it.each([
    ["Week 1 slides", "pdf", "Week 1 slides.pdf"],
    ["Report.PDF", "pdf", "Report.pdf"],
    ["../../etc/passwd", "pdf", ".. .. etc passwd.pdf"],
    ["   ", "zip", "file.zip"],
    ["a\u0007b", "csv", "a b.csv"],
  ])("%p + %s → %s", (title, ext, name) => {
    expect(downloadFileName(title, ext)).toBe(name);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [10 * 1024, "10 KB"],
    [200 * 1024 * 1024, "200 MB"],
    [1_288_490_189, "1.2 GB"],
    [5 * 1024 ** 3, "5 GB"],
  ])("%d → %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
