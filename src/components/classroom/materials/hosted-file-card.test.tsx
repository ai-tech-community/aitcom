import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import type { MaterialsManifest } from "@/lib/classroom/material-access";

const m = vi.hoisted(() => ({
  fetchLink: vi.fn(),
  useLinkQuery: vi.fn(),
  startDownload: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classroomMaterials: { fileLink: { fetch: m.fetchLink } },
    }),
    classroomMaterials: { fileLink: { useQuery: m.useLinkQuery } },
  },
}));
vi.mock("./start-download", () => ({ startDownload: m.startDownload }));
vi.mock("sonner", () => ({ toast: { error: m.toastError } }));

import { LexicalRenderer } from "@/lib/lexical";
import { hostedFileBlockNode } from "@/lib/classroom/lesson-body";
import { classroomBlockRenderers } from "./block-renderers";
import { HostedFileCard } from "./hosted-file-card";
import { MaterialsManifestProvider } from "./materials-context";

const files = en.classroom.files;

const summary = (over: Record<string, unknown> = {}) =>
  ({
    access: "download",
    kind: "file",
    title: "Workbook",
    extension: "docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: 1536,
    status: "ready",
    visibility: "members",
    ...over,
  }) as MaterialsManifest[number];

function renderCard(manifest: MaterialsManifest, materialId = 5) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MaterialsManifestProvider manifest={manifest}>
        <HostedFileCard materialId={materialId} />
      </MaterialsManifestProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.useLinkQuery.mockReturnValue({ data: undefined });
  m.fetchLink.mockResolvedValue({ url: "https://signed.test/f" });
});

describe("HostedFileCard", () => {
  it("shows title, type and size, and downloads through a fresh link", async () => {
    renderCard({ 5: summary() });
    expect(screen.getByText("Workbook")).toBeInTheDocument();
    expect(screen.getByText("DOCX · 1.5 KB")).toBeInTheDocument();
    expect(m.fetchLink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: files.download }));
    await waitFor(() =>
      expect(m.startDownload).toHaveBeenCalledWith("https://signed.test/f"),
    );
    expect(m.fetchLink).toHaveBeenCalledWith({
      materialId: 5,
      disposition: "attachment",
    });
    expect(m.useLinkQuery).not.toHaveBeenCalled();
  });

  it("says so when the download link can't be fetched", async () => {
    m.fetchLink.mockRejectedValue(new Error("NOT_FOUND"));
    renderCard({ 5: summary() });
    fireEvent.click(screen.getByRole("button", { name: files.download }));
    await waitFor(() =>
      expect(m.toastError).toHaveBeenCalledWith(files.downloadFailed),
    );
    expect(m.startDownload).not.toHaveBeenCalled();
  });

  it("previews a PDF from an inline link", () => {
    m.useLinkQuery.mockReturnValue({
      data: { url: "https://signed.test/inline" },
    });
    renderCard({
      5: summary({ extension: "pdf", contentType: "application/pdf" }),
    });
    expect(m.useLinkQuery).toHaveBeenCalledWith(
      { materialId: 5, disposition: "inline" },
      expect.objectContaining({ staleTime: expect.any(Number) }),
    );
    const frame = screen.getByTitle("Preview of Workbook");
    expect(frame.getAttribute("src")).toBe("https://signed.test/inline");
  });

  it("says the preview didn't load and retries it, keeping the download", () => {
    const refetch = vi.fn();
    m.useLinkQuery.mockReturnValue({ data: undefined, isError: true, refetch });
    renderCard({
      5: summary({ extension: "pdf", contentType: "application/pdf" }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(files.previewFailed);
    expect(screen.queryByTitle("Preview of Workbook")).toBeNull();
    expect(
      screen.getByRole("button", { name: files.download }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: files.tryAgain }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the Download button focusable while it fetches, and ignores repeat clicks", async () => {
    let resolveLink: (value: { url: string }) => void = () => undefined;
    m.fetchLink.mockReturnValue(
      new Promise((resolve) => {
        resolveLink = resolve;
      }),
    );
    renderCard({ 5: summary() });
    const button = screen.getByRole("button", { name: files.download });
    button.focus();
    fireEvent.click(button);
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(m.fetchLink).toHaveBeenCalledTimes(1);

    resolveLink({ url: "https://signed.test/f" });
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(m.startDownload).toHaveBeenCalledTimes(1);
  });

  it("tells a visitor to join for a members-only file, with no download", () => {
    renderCard({ 5: summary({ access: "join", extension: "pdf" }) });
    expect(screen.getByText(files.join)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: files.download })).toBeNull();
    expect(m.useLinkQuery).not.toHaveBeenCalled();
  });

  it.each([
    ["processing", files.processing],
    ["failed", files.failed],
  ])("shows a %s note instead of a download", (access, text) => {
    renderCard({ 5: summary({ access }) });
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: files.download })).toBeNull();
  });

  it("says a deleted file was removed", () => {
    renderCard({});
    expect(screen.getByText(files.removed)).toBeInTheDocument();
  });
});

describe("classroom block renderers: HostedFile", () => {
  it("renders a card only for a usable file id", () => {
    expect(
      classroomBlockRenderers.HostedFile!({ materialId: 5 }),
    ).not.toBeNull();
    expect(classroomBlockRenderers.HostedFile!({ materialId: "5" })).toBeNull();
    expect(classroomBlockRenderers.HostedFile!({ materialId: 0 })).toBeNull();
  });

  it("shows the file inside a rendered lesson body", () => {
    const body = {
      root: {
        type: "root",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [hostedFileBlockNode(5, "abcabcabcabc")],
      },
    };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MaterialsManifestProvider manifest={{ 5: summary() }}>
          <LexicalRenderer
            content={body}
            blockRenderers={classroomBlockRenderers}
          />
        </MaterialsManifestProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Workbook")).toBeInTheDocument();
  });
});
