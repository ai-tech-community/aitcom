import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

type Query = {
  data?: unknown[];
  isLoading: boolean;
  isError: boolean;
  error?: { data?: { code?: string } } | null;
  refetch?: () => void;
};
type MutationOptions = { onSuccess?: () => void; onError?: () => void };

const m = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  invalidateList: vi.fn(),
  invalidateCourse: vi.fn(),
  removeOptions: {} as MutationOptions,
  query: {} as Query,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classroomMaterials: {
        listCourseMaterials: { invalidate: m.invalidateList },
      },
      classrooms: { get: { invalidate: m.invalidateCourse } },
    }),
    classroomMaterials: {
      listCourseMaterials: { useQuery: () => m.query },
      updateMaterial: {
        useMutation: () => ({ mutate: m.update, isPending: false }),
      },
      deleteMaterial: {
        useMutation: (options: MutationOptions) => {
          m.removeOptions = options;
          return { mutate: m.remove, isPending: false };
        },
      },
    },
  },
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => m.confirm }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CourseFilesPanel } from "./course-files-panel";

const files = en.classroom.files;
const file = (over: Record<string, unknown> = {}) => ({
  id: 7,
  title: "Handout",
  extension: "pdf",
  contentType: "application/pdf",
  bytes: 2048,
  status: "ready",
  visibility: "members",
  failureReason: null,
  createdAt: "2026-09-28T10:00:00.000Z",
  ...over,
});
const loaded = (data: unknown[]): Query => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
});

function renderPanel(canUpload = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseFilesPanel courseId={5} canUpload={canUpload} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.query = loaded([file()]);
});

describe("CourseFilesPanel", () => {
  it("lists each file with its name, type and size", () => {
    renderPanel();
    expect(
      screen.getByRole("heading", { name: files.panelTitle }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Handout")).toBeInTheDocument();
    expect(screen.getByText("PDF · 2 KB")).toBeInTheDocument();
  });

  it("turns a file into a free preview, and back to members only", () => {
    const first = renderPanel();
    fireEvent.click(screen.getByRole("switch", { name: files.previewToggle }));
    expect(m.update).toHaveBeenCalledWith({
      materialId: 7,
      visibility: "preview",
    });
    first.unmount();

    m.query = loaded([file({ visibility: "preview" })]);
    renderPanel();
    fireEvent.click(screen.getByRole("switch", { name: files.previewToggle }));
    expect(m.update).toHaveBeenLastCalledWith({
      materialId: 7,
      visibility: "members",
    });
  });

  it("renames on blur, and ignores an unchanged or empty name", () => {
    renderPanel();
    const input = screen.getByLabelText(files.titleLabel);
    fireEvent.change(input, { target: { value: "  Week 1 handout " } });
    fireEvent.blur(input);
    expect(m.update).toHaveBeenCalledWith(
      { materialId: 7, title: "Week 1 handout" },
      expect.anything(),
    );

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "Handout" } });
    fireEvent.blur(input);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Handout");
  });

  it("puts the old name back when a rename fails", () => {
    renderPanel();
    const input = screen.getByLabelText(files.titleLabel);
    fireEvent.change(input, { target: { value: "Week 1 handout" } });
    fireEvent.blur(input);
    const options = m.update.mock.calls[0]![1] as MutationOptions;
    options.onError?.();
    expect(input).toHaveValue("Handout");
  });

  it("asks before deleting, then deletes and refreshes the list", async () => {
    m.confirm.mockResolvedValue(true);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: files.deleteFile }));
    await waitFor(() =>
      expect(m.remove).toHaveBeenCalledWith({ materialId: 7 }),
    );
    expect(m.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: files.deleteConfirm,
        destructive: true,
      }),
    );

    m.removeOptions.onSuccess?.();
    expect(m.invalidateList).toHaveBeenCalledWith({ courseId: 5 });
    expect(m.invalidateCourse).toHaveBeenCalled();
  });

  it("keeps the file when the author says no", async () => {
    m.confirm.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: files.deleteFile }));
    await waitFor(() => expect(m.confirm).toHaveBeenCalled());
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("shows files still uploading or that failed", () => {
    m.query = loaded([
      file({ id: 8, status: "uploading" }),
      file({ id: 9, status: "failed" }),
    ]);
    renderPanel();
    expect(screen.getByText(files.statusUploading)).toBeInTheDocument();
    expect(screen.getByText(files.statusFailed)).toBeInTheDocument();
  });

  it("says when there are no files yet, to an author who can upload", () => {
    m.query = loaded([]);
    renderPanel(true);
    expect(screen.getByText(files.panelEmpty)).toBeInTheDocument();
  });

  it("stays hidden for an author who can't upload and has no files", () => {
    m.query = loaded([]);
    const { container } = renderPanel(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("still lets an author who can't upload manage the files they have", () => {
    renderPanel(false);
    expect(screen.getByDisplayValue("Handout")).toBeInTheDocument();
    expect(screen.queryByText(files.panelEmpty)).toBeNull();
  });

  it("stays hidden when the viewer may not manage the course's files", () => {
    m.query = {
      isLoading: false,
      isError: true,
      error: { data: { code: "FORBIDDEN" } },
    };
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a retry when the files could not be loaded", () => {
    const refetch = vi.fn();
    m.query = {
      isLoading: false,
      isError: true,
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
      refetch,
    };
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(refetch).toHaveBeenCalled();
  });
});
