import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import type { PaneSaveState } from "./course-builder";

const trpc = vi.hoisted(() => ({
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  setData: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: trpc.toastError } }));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ classrooms: { get: { setData: trpc.setData } } }),
    classrooms: {
      updateLesson: {
        useMutation: () => ({ mutateAsync: trpc.updateLesson }),
      },
      deleteLesson: {
        useMutation: () => ({ mutateAsync: trpc.deleteLesson }),
      },
    },
  },
}));

// Lexical does not need to run here: the editor is a plain textarea whose
// text becomes a one-paragraph body, or the raw JSON when it starts with "{".
vi.mock("@/components/article-editor/rich-text-editor", () => ({
  RichTextEditor: ({
    initialValue,
    onChange,
  }: {
    initialValue?: unknown;
    onChange: (state: unknown) => void;
  }) => (
    <textarea
      aria-label="Rich text"
      defaultValue={initialValue ? JSON.stringify(initialValue) : ""}
      onChange={(e) => {
        const text = e.target.value;
        onChange(
          text.startsWith("{")
            ? (JSON.parse(text) as unknown)
            : {
                root: {
                  type: "root",
                  children: [
                    { type: "paragraph", children: [{ type: "text", text }] },
                  ],
                },
              },
        );
      }}
    />
  ),
}));

import { ConfirmProvider } from "@/components/confirm-dialog";
import { LessonEditorScope, type LessonLike } from "./lesson-editor-scope";
import { createLessonVersionRegistry } from "./lesson-versions";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";

type Fixture = {
  lessonId: number;
  title: string;
  updatedAt?: string;
  readOnly?: boolean;
  lesson?: Partial<LessonLike>;
};

function renderScope(fixture: Fixture) {
  const onStatusChange = vi.fn<(s: PaneSaveState) => void>();
  const onDeleted = vi.fn<(lessonId: number) => void>();
  const isDeleted = vi.fn<(lessonId: number) => boolean>(() => false);
  const onToggleSettings = vi.fn();
  const versions = createLessonVersionRegistry();

  const ui = (f: Fixture) => (
    <NextIntlClientProvider locale="en" messages={en}>
      <ConfirmProvider>
        <LessonEditorScope
          key={f.lessonId}
          courseSlug="intro-1"
          lesson={{
            id: f.lessonId,
            title: f.title,
            updatedAt: f.updatedAt ?? T0,
            ...f.lesson,
          }}
          readOnly={f.readOnly ?? false}
          versions={versions}
          onStatusChange={onStatusChange}
          isDeleted={isDeleted}
          onDeleted={onDeleted}
          settingsCollapsed={false}
          onToggleSettings={onToggleSettings}
        />
      </ConfirmProvider>
    </NextIntlClientProvider>
  );

  const view = render(ui(fixture));
  const rerenderWithLesson = async (next: Fixture) => {
    await act(async () => {
      view.rerender(ui(next));
    });
  };
  return { rerenderWithLesson, onStatusChange, onDeleted, isDeleted };
}

const lastState = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.at(-1)?.[0] as PaneSaveState | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  trpc.updateLesson.mockReset();
  trpc.updateLesson.mockResolvedValue({ ok: true, updatedAt: T1 });
  trpc.deleteLesson.mockReset();
  trpc.setData.mockReset();
  trpc.toastError.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("LessonEditorScope saving", () => {
  it("saves the lesson you were editing when you switch to another lesson", async () => {
    const { rerenderWithLesson } = renderScope({ lessonId: 1, title: "One" });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    await rerenderWithLesson({ lessonId: 2, title: "Two" });
    expect(trpc.updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 1, title: "One edited" }),
    );
    expect(trpc.updateLesson).not.toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 2 }),
    );
    expect(screen.getByLabelText("Lesson title")).toHaveValue("Two");
  });

  it("sends expectedUpdatedAt and then chains the returned one", async () => {
    trpc.updateLesson
      .mockResolvedValueOnce({ ok: true, updatedAt: T1 })
      .mockResolvedValueOnce({ ok: true, updatedAt: T2 });
    renderScope({ lessonId: 1, title: "One", updatedAt: T0 });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "A" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "AB" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(trpc.updateLesson).toHaveBeenCalledTimes(2);
    expect(trpc.updateLesson.mock.calls[0]![0].expectedUpdatedAt).toBe(T0);
    expect(trpc.updateLesson.mock.calls[1]![0].expectedUpdatedAt).toBe(T1);
  });

  it("sends the whole lesson, trimmed, with only complete resource links", async () => {
    renderScope({
      lessonId: 1,
      title: "One",
      lesson: {
        resources: [
          { label: "Slides", url: "https://example.com/slides" },
          { label: "", url: "https://example.com/no-name" },
        ],
        examMandatory: true,
        examPassThreshold: 80,
        examMaxAttempts: 3,
        examQuestions: [
          {
            id: "q1",
            prompt: "Why?",
            type: "single",
            options: ["a", "b"],
            correctIndex: 1,
          },
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "  One edited  " },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(trpc.updateLesson).toHaveBeenCalledWith({
      lessonId: 1,
      title: "One edited",
      body: null,
      resources: [{ label: "Slides", url: "https://example.com/slides" }],
      examMandatory: true,
      examPassThreshold: 80,
      examMaxAttempts: 3,
      examQuestions: [
        {
          id: "q1",
          prompt: "Why?",
          type: "single",
          options: ["a", "b"],
          correctIndex: 1,
        },
      ],
      expectedUpdatedAt: T0,
    });
  });

  it("drops embeds the author never gave a link before saving the body", async () => {
    renderScope({ lessonId: 1, title: "One" });
    const body = {
      root: {
        type: "root",
        children: [
          { type: "paragraph", children: [{ type: "text", text: "Hi" }] },
          {
            type: "block",
            version: 2,
            format: "",
            fields: { id: "e1", blockName: "", blockType: "Embed", url: "" },
          },
        ],
      },
    };
    fireEvent.change(screen.getByLabelText("Rich text"), {
      target: { value: JSON.stringify(body) },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const saved = trpc.updateLesson.mock.calls[0]![0].body as {
      root: { children: unknown[] };
    };
    expect(saved.root.children).toEqual([body.root.children[0]]);
  });

  it("drops file blocks that never got a file, and keeps chosen files", async () => {
    renderScope({ lessonId: 1, title: "One" });
    const fileBlock = (id: string, materialId: number) => ({
      type: "block",
      version: 2,
      format: "",
      fields: { id, blockName: "", blockType: "HostedFile", materialId },
    });
    const body = {
      root: {
        type: "root",
        children: [fileBlock("f1", 0), fileBlock("f2", 42)],
      },
    };
    fireEvent.change(screen.getByLabelText("Rich text"), {
      target: { value: JSON.stringify(body) },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const saved = trpc.updateLesson.mock.calls[0]![0].body as {
      root: { children: unknown[] };
    };
    expect(saved.root.children).toEqual([fileBlock("f2", 42)]);
  });

  it("does not save a blank title and says why", async () => {
    const { onStatusChange } = renderScope({ lessonId: 1, title: "One" });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "  " },
    });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(trpc.updateLesson).not.toHaveBeenCalled();
    expect(
      screen.getByText(en.classroomBuilder.lessonTitleRequired),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Lesson title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // A blank title is unsaved work: publish and leaving must see it.
    expect(lastState(onStatusChange)?.status).toBe("dirty");
    expect(await lastState(onStatusChange)!.flush()).toBe("dirty");
  });

  it("writes each saved lesson into the course cache, with its new version", async () => {
    renderScope({ lessonId: 1, title: "One" });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(trpc.setData).toHaveBeenCalledWith(
      { slug: "intro-1" },
      expect.any(Function),
    );
    const updater = trpc.setData.mock.calls[0]![1] as (old: unknown) => {
      lessons: { id: number; title: string; updatedAt: string }[];
    };
    const next = updater({
      course: {},
      lessons: [
        { id: 1, title: "One", updatedAt: T0 },
        { id: 2, title: "Two", updatedAt: T0 },
      ],
    });
    expect(next.lessons[0]).toMatchObject({
      id: 1,
      title: "One edited",
      updatedAt: T1,
      resources: [],
      examQuestions: [],
    });
    expect(next.lessons[1]).toEqual({ id: 2, title: "Two", updatedAt: T0 });
  });

  it("explains a refused embed in plain words and keeps the draft", async () => {
    trpc.updateLesson.mockRejectedValueOnce(new Error("INVALID_EMBED"));
    const { onStatusChange } = renderScope({ lessonId: 1, title: "One" });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(lastState(onStatusChange)?.status).toBe("error");
    expect(
      screen.getByText(en.classroomBuilder.errorInvalidEmbed),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Lesson title")).toHaveValue("One edited");
  });

  it("explains a refused file in plain words and keeps the draft", async () => {
    trpc.updateLesson.mockRejectedValueOnce(new Error("INVALID_MATERIAL"));
    const { onStatusChange } = renderScope({ lessonId: 1, title: "One" });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(lastState(onStatusChange)?.status).toBe("error");
    expect(
      screen.getByText(en.classroomBuilder.errorInvalidMaterial),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Lesson title")).toHaveValue("One edited");
  });

  it("reports a stale lesson as a conflict, not an error message", async () => {
    trpc.updateLesson.mockRejectedValueOnce(new Error("LESSON_CHANGED"));
    const { onStatusChange } = renderScope({ lessonId: 1, title: "One" });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(lastState(onStatusChange)?.status).toBe("conflict");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not save a lesson that was deleted, even on the way out", async () => {
    const { rerenderWithLesson, isDeleted } = renderScope({
      lessonId: 1,
      title: "One",
    });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    isDeleted.mockImplementation((id) => id === 1);
    await rerenderWithLesson({ lessonId: 2, title: "Two" });
    expect(trpc.updateLesson).not.toHaveBeenCalled();
  });
});

describe("LessonSettingsPane", () => {
  it("hides the quiz behind 'Add a quiz' until it is used", () => {
    renderScope({ lessonId: 1, title: "One" });
    expect(screen.queryByLabelText(/Pass threshold/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a quiz" }));
    expect(screen.getByLabelText("Question 1")).toHaveValue("");
    expect(screen.getByLabelText(/Pass threshold/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a quiz" })).toBeNull();
  });

  it("shows the quiz straight away when the lesson has one", () => {
    renderScope({
      lessonId: 1,
      title: "One",
      lesson: {
        examQuestions: [
          {
            id: "q1",
            prompt: "Why?",
            type: "single",
            options: ["a", "b"],
            correctIndex: 0,
          },
        ],
      },
    });
    expect(screen.getByLabelText("Question 1")).toHaveValue("Why?");
    expect(screen.queryByRole("button", { name: "Add a quiz" })).toBeNull();
  });

  it("names the settings sections in normal case (the label styles them)", () => {
    renderScope({ lessonId: 1, title: "One" });
    expect(
      screen.getByRole("heading", { level: 3, name: "Resources" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Quiz" }),
    ).toBeInTheDocument();
  });

  it("adds, labels and removes resource links", () => {
    renderScope({ lessonId: 1, title: "One" });
    fireEvent.click(screen.getByRole("button", { name: "Add a link" }));
    fireEvent.change(screen.getByLabelText("Link 1 name"), {
      target: { value: "Slides" },
    });
    fireEvent.change(screen.getByLabelText("Link 1 address"), {
      target: { value: "not a link" },
    });
    expect(screen.getByLabelText("Link 1 address")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByText(en.classroomBuilder.resourceUrlInvalid),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove link 1" }));
    expect(screen.queryByLabelText("Link 1 name")).toBeNull();
  });

  it("asks for the address when a link has only a name", () => {
    renderScope({ lessonId: 1, title: "One" });
    fireEvent.click(screen.getByRole("button", { name: "Add a link" }));
    fireEvent.change(screen.getByLabelText("Link 1 name"), {
      target: { value: "Slides" },
    });
    expect(screen.getByLabelText("Link 1 address")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Link 1 address")).toHaveAccessibleDescription(
      en.classroomBuilder.resourceUrlMissing,
    );
  });

  it("counts a half-typed link as unsaved work, even after the rest saved", async () => {
    const { onStatusChange } = renderScope({ lessonId: 1, title: "One" });
    fireEvent.click(screen.getByRole("button", { name: "Add a link" }));
    // A fully blank new row is not work yet.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(lastState(onStatusChange)?.status).not.toBe("dirty");
    fireEvent.change(screen.getByLabelText("Link 1 name"), {
      target: { value: "Slides" },
    });
    fireEvent.change(screen.getByLabelText("Lesson title"), {
      target: { value: "One edited" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(trpc.updateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ title: "One edited", resources: [] }),
    );
    expect(lastState(onStatusChange)?.status).toBe("dirty");
    expect(await lastState(onStatusChange)!.flush()).toBe("dirty");
    // Completing the link makes it savable, and the pane settles.
    fireEvent.change(screen.getByLabelText("Link 1 address"), {
      target: { value: "https://example.com/slides" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(trpc.updateLesson).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resources: [{ label: "Slides", url: "https://example.com/slides" }],
      }),
    );
    expect(lastState(onStatusChange)?.status).toBe("saved");
  });

  it("treats a stored link the server accepted as saved, even if it is not a web page", async () => {
    const { onStatusChange } = renderScope({
      lessonId: 1,
      title: "One",
      lesson: {
        resources: [{ label: "Email me", url: "mailto:teacher@example.com" }],
      },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByLabelText("Link 1 address")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(lastState(onStatusChange)?.status).toBe("idle");
    expect(trpc.updateLesson).not.toHaveBeenCalled();
  });

  it("deletes the lesson after the same confirm as the outline", async () => {
    trpc.deleteLesson.mockResolvedValueOnce({ ok: true });
    const { onDeleted } = renderScope({ lessonId: 1, title: "One" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    });
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      en.classroomBuilder.deleteLessonConfirm.replace("{title}", "One"),
    );
    await act(async () => {
      fireEvent.click(
        within(confirm).getByRole("button", { name: "Delete lesson" }),
      );
    });
    expect(trpc.deleteLesson).toHaveBeenCalledWith({ lessonId: 1 });
    expect(onDeleted).toHaveBeenCalledWith(1);
  });

  it("keeps the lesson and says why when deleting fails", async () => {
    trpc.deleteLesson.mockRejectedValueOnce(new Error("COURSE_ARCHIVED"));
    const { onDeleted } = renderScope({ lessonId: 1, title: "One" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Delete lesson",
        }),
      );
    });
    expect(onDeleted).not.toHaveBeenCalled();
    expect(trpc.toastError).toHaveBeenCalledWith(
      en.classroomBuilder.errorArchived,
    );
  });

  it("is read-only for an archived course", () => {
    renderScope({
      lessonId: 1,
      title: "One",
      readOnly: true,
      lesson: { resources: [{ label: "Slides", url: "https://e.com/s" }] },
    });
    expect(screen.getByLabelText("Lesson title")).toBeDisabled();
    expect(screen.getByLabelText("Link 1 name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete lesson" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a quiz" })).toBeNull();
    // The shared editor has no read-only mode: the body is shown as learners see it.
    expect(screen.queryByLabelText("Rich text")).toBeNull();
  });
});
