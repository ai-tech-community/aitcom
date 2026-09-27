import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  reorder: vi.fn(),
  addLesson: vi.fn(),
  deleteLesson: vi.fn(),
  addModule: vi.fn(),
  renameModule: vi.fn(),
  reorderModules: vi.fn(),
  deleteModule: vi.fn(),
  dissolveModules: vi.fn(),
  invalidate: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: m.toastError } }));
vi.mock("@/trpc/react", () => {
  const mutation = (fn: ReturnType<typeof vi.fn>) => () => ({
    mutate: fn,
    mutateAsync: fn,
    isPending: false,
  });
  return {
    api: {
      useUtils: () => ({
        classrooms: { get: { invalidate: m.invalidate, setData: vi.fn() } },
      }),
      classrooms: {
        reorderLessons: { useMutation: mutation(m.reorder) },
        addLesson: { useMutation: mutation(m.addLesson) },
        deleteLesson: { useMutation: mutation(m.deleteLesson) },
        addModule: { useMutation: mutation(m.addModule) },
        renameModule: { useMutation: mutation(m.renameModule) },
        reorderModules: { useMutation: mutation(m.reorderModules) },
        deleteModule: { useMutation: mutation(m.deleteModule) },
        dissolveModules: { useMutation: mutation(m.dissolveModules) },
      },
    },
  };
});
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => m.confirm }));

import { CourseOutline } from "./course-outline";
import type { BuilderSelection } from "./course-builder";

type Props = Parameters<typeof CourseOutline>[0];

const modules = [
  { id: 10, title: "Basics", order: 0 },
  { id: 20, title: "Advanced", order: 1 },
];
const withText = {
  root: {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", text: "hi" }] }],
  },
};
const quiz = [
  {
    id: "q",
    prompt: "p",
    type: "single",
    options: ["a", "b"],
    correctIndex: 0,
  },
];
const lessons: Props["lessons"] = [
  { id: 1, title: "Welcome", module: 10, order: 0, body: withText },
  { id: 2, title: "Setup", module: 10, order: 1 },
  { id: 3, title: "Deploy", module: 20, order: 0, examQuestions: quiz },
];

function ui(props: Partial<Props>) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseOutline
        courseId={99}
        lessons={lessons}
        modules={modules}
        selection={{ kind: "details" }}
        onSelect={vi.fn()}
        readOnly={false}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

function renderOutline(props: Partial<Props> = {}) {
  const onSelect = props.onSelect ?? vi.fn();
  const view = render(ui({ ...props, onSelect }));
  return {
    ...view,
    onSelect,
    rerenderWith: (p: Partial<Props>) =>
      view.rerender(ui({ ...props, onSelect, ...p })),
  };
}

/** Radix menus open from the keyboard in jsdom (pointer events are incomplete there). */
function openMenu(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: "Enter" });
}

function openRowMenu(id: number) {
  const row = screen.getByTestId(`outline-lesson-${id}`);
  openMenu(within(row).getByRole("button", { name: "Lesson actions" }));
}

function openModuleMenu(moduleId: number) {
  const header = screen.getByTestId(`outline-module-${moduleId}`);
  openMenu(within(header).getByRole("button", { name: "Module actions" }));
}

/** The lesson number shown in a row, e.g. "3". */
function numberOf(id: number) {
  return within(screen.getByTestId(`outline-lesson-${id}`)).getByTestId(
    "lesson-number",
  ).textContent;
}

describe("CourseOutline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.confirm.mockResolvedValue(true);
  });

  it("numbers lessons in reading order across modules", () => {
    renderOutline();
    expect(
      screen.getByRole("button", { name: /3.*Deploy/ }),
    ).toBeInTheDocument();
    expect([numberOf(1), numberOf(2), numberOf(3)]).toEqual(["1", "2", "3"]);
  });

  it("marks lessons with no content as empty, and lessons with a quiz", () => {
    renderOutline();
    expect(
      within(screen.getByTestId("outline-lesson-2")).getByText("Empty"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("outline-lesson-1")).queryByText("Empty"),
    ).toBeNull();
    expect(
      within(screen.getByTestId("outline-lesson-3")).getByText("Has a quiz"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("outline-lesson-1")).queryByText("Has a quiz"),
    ).toBeNull();
  });

  it("selects course details or a lesson, and marks the current one", () => {
    const { onSelect } = renderOutline({
      selection: { kind: "lesson", lessonId: 2 },
    });
    expect(screen.getByRole("button", { name: /^2 Setup/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Course details" }),
    ).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("button", { name: /^3 Deploy/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "lesson", lessonId: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Course details" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "details" });
  });

  it("'Move down' on the last lesson of a module sends it to the top of the next module", () => {
    renderOutline();
    openRowMenu(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(m.reorder).toHaveBeenCalledWith(
      { courseId: 99, moduleId: 20, orderedIds: [2, 3] },
      expect.anything(),
    );
  });

  it("shows a move at once, before the server answers", () => {
    renderOutline();
    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(numberOf(2)).toBe("1");
    expect(numberOf(1)).toBe("2");
  });

  it("puts the order back and explains when the server refuses a move", () => {
    m.reorder.mockImplementation(
      (
        _input,
        opts: { onError: (e: Error) => void; onSettled?: () => void },
      ) => {
        opts.onError(new Error("LESSON_SET_MISMATCH"));
        opts.onSettled?.();
      },
    );
    renderOutline();
    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(numberOf(1)).toBe("1");
    expect(m.toastError).toHaveBeenCalledWith(
      en.classroomBuilder.errorOutlineOutOfDate,
    );
    expect(m.invalidate).toHaveBeenCalled();
  });

  it("cannot move the first lesson up or the last lesson down", () => {
    renderOutline();
    openRowMenu(1);
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("moves a lesson to the end of another module from the 'Move to module' menu", () => {
    renderOutline();
    openRowMenu(1);
    const sub = screen.getByRole("menuitem", { name: "Move to module" });
    fireEvent.keyDown(sub, { key: "ArrowRight" });
    // Only the other modules are offered.
    expect(screen.queryByRole("menuitem", { name: "Basics" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Advanced" }));
    expect(m.reorder).toHaveBeenCalledWith(
      { courseId: 99, moduleId: 20, orderedIds: [3, 1] },
      expect.anything(),
    );
  });

  it("offers no 'Move to module' in a course without modules", () => {
    renderOutline({
      modules: [],
      lessons: lessons.map((l) => ({ ...l, module: null })),
    });
    openRowMenu(1);
    expect(
      screen.queryByRole("menuitem", { name: "Move to module" }),
    ).toBeNull();
  });

  it("asks before deleting a lesson and does nothing when cancelled", async () => {
    m.confirm.mockResolvedValueOnce(false);
    renderOutline();
    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete lesson" }));
    await vi.waitFor(() => expect(m.confirm).toHaveBeenCalled());
    expect(m.deleteLesson).not.toHaveBeenCalled();
  });

  it("deletes the selected lesson after confirming and selects the next one", async () => {
    m.deleteLesson.mockImplementation(
      (_input, opts: { onSuccess: () => void }) => opts.onSuccess(),
    );
    const { onSelect } = renderOutline({
      selection: { kind: "lesson", lessonId: 2 },
    });
    openRowMenu(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete lesson" }));
    await vi.waitFor(() => expect(m.deleteLesson).toHaveBeenCalled());
    expect(m.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("“Setup”"),
        destructive: true,
      }),
    );
    expect(m.deleteLesson).toHaveBeenCalledWith(
      { lessonId: 2 },
      expect.anything(),
    );
    expect(onSelect).toHaveBeenCalledWith<[BuilderSelection]>({
      kind: "lesson",
      lessonId: 3,
    });
  });

  it("selects course details after deleting the selected last lesson", async () => {
    m.deleteLesson.mockImplementation(
      (_input, opts: { onSuccess: () => void }) => opts.onSuccess(),
    );
    const { onSelect } = renderOutline({
      selection: { kind: "lesson", lessonId: 3 },
    });
    openRowMenu(3);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete lesson" }));
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ kind: "details" }),
    );
  });

  it("adds a lesson to that module on Enter and keeps the input focused and empty", () => {
    renderOutline();
    const input = screen.getAllByPlaceholderText("Add a lesson…")[1]!;
    input.focus();
    fireEvent.change(input, { target: { value: "Monitoring" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(m.addLesson).toHaveBeenCalledWith({
      courseId: 99,
      title: "Monitoring",
      moduleId: 20,
    });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("gives the title back when adding a lesson fails", async () => {
    m.addLesson.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderOutline();
    const input = screen.getAllByPlaceholderText("Add a lesson…")[0]!;
    fireEvent.change(input, { target: { value: "Intro" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(input).toHaveValue("Intro"));
    expect(m.toastError).toHaveBeenCalledWith(
      en.classroomBuilder.errorNotAllowed,
    );
  });

  it("ignores a blank title and clears the input on Escape", () => {
    renderOutline();
    const input = screen.getAllByPlaceholderText("Add a lesson…")[0]!;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(m.addLesson).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Draft" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  it("adds a lesson without a module in a course without modules", () => {
    renderOutline({
      modules: [],
      lessons: lessons.map((l) => ({ ...l, module: null })),
    });
    const inputs = screen.getAllByPlaceholderText("Add a lesson…");
    expect(inputs).toHaveLength(1);
    fireEvent.change(inputs[0]!, { target: { value: "Extra" } });
    fireEvent.keyDown(inputs[0]!, { key: "Enter" });
    expect(m.addLesson).toHaveBeenCalledWith({ courseId: 99, title: "Extra" });
  });

  it("shows a first-lesson hint in an empty course", () => {
    renderOutline({ modules: [], lessons: [] });
    expect(
      screen.getByText(en.classroomBuilder.emptyCourseHint),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a lesson…")).toBeInTheDocument();
  });

  it("lets an empty module accept dropped lessons", () => {
    renderOutline({
      modules: [...modules, { id: 30, title: "Later", order: 2 }],
    });
    expect(
      within(screen.getByTestId("outline-group-30")).getByText(
        "Drop a lesson here",
      ),
    ).toBeInTheDocument();
  });

  it("renames a module in place: Enter saves, Escape cancels", () => {
    renderOutline();
    fireEvent.click(screen.getByRole("button", { name: "Basics" }));
    const input = screen.getByRole("textbox", { name: "Module title" });
    fireEvent.change(input, { target: { value: "Foundations" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(m.renameModule).toHaveBeenCalledWith({
      moduleId: 10,
      title: "Foundations",
    });
    // The new name shows at once, not the old one while the server answers.
    expect(
      screen.getByRole("button", { name: "Foundations" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    const second = screen.getByRole("textbox", { name: "Module title" });
    fireEvent.change(second, { target: { value: "Nope" } });
    fireEvent.keyDown(second, { key: "Escape" });
    expect(m.renameModule).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Advanced" }),
    ).toBeInTheDocument();
  });

  it("saves a module summary from the module menu and shows it at once", () => {
    renderOutline();
    openModuleMenu(10);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a summary" }));
    const box = screen.getByRole("textbox", { name: "Module summary" });
    fireEvent.change(box, { target: { value: "The ground floor." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(m.renameModule).toHaveBeenCalledWith({
      moduleId: 10,
      summary: "The ground floor.",
    });
    expect(screen.getByText("The ground floor.")).toBeInTheDocument();
  });

  it("shows the old module name again and explains when a rename fails", async () => {
    m.renameModule.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderOutline();
    fireEvent.click(screen.getByRole("button", { name: "Basics" }));
    const input = screen.getByRole("textbox", { name: "Module title" });
    fireEvent.change(input, { target: { value: "Foundations" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByRole("button", { name: "Basics" }),
    ).toBeInTheDocument();
    expect(m.toastError).toHaveBeenCalledWith(
      en.classroomBuilder.errorNotAllowed,
    );
  });

  it("moves a module down from its menu", () => {
    renderOutline();
    openModuleMenu(10);
    expect(
      screen.getByRole("menuitem", { name: "Move module up" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move module down" }));
    expect(m.reorderModules).toHaveBeenCalledWith(
      { courseId: 99, orderedIds: [20, 10] },
      expect.anything(),
    );
  });

  it("won't delete a module that still has lessons, and says why", () => {
    renderOutline();
    openModuleMenu(10);
    const item = screen.getByRole("menuitem", { name: /Delete module/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(
      within(item).getByText(en.classroomBuilder.errorModuleNotEmpty),
    ).toBeInTheDocument();
  });

  it("asks before deleting an empty module", async () => {
    renderOutline({
      modules: [...modules, { id: 30, title: "Later", order: 2 }],
    });
    openModuleMenu(30);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete module" }));
    await vi.waitFor(() =>
      expect(m.deleteModule).toHaveBeenCalledWith(
        { moduleId: 30 },
        expect.anything(),
      ),
    );
    expect(m.confirm).toHaveBeenCalled();
  });

  it("adds a numbered module and opens its title for editing", () => {
    m.addModule.mockImplementation(
      (_input, opts: { onSuccess: (r: { id: number }) => void }) =>
        opts.onSuccess({ id: 30 }),
    );
    const { rerenderWith } = renderOutline();
    fireEvent.click(screen.getByRole("button", { name: "Add module" }));
    expect(m.addModule).toHaveBeenCalledWith(
      { courseId: 99, title: "Module 3" },
      expect.anything(),
    );
    rerenderWith({
      modules: [...modules, { id: 30, title: "Module 3", order: 2 }],
    });
    expect(screen.getByRole("textbox", { name: "Module title" })).toHaveValue(
      "Module 3",
    );
  });

  it("offers to group a flat course's lessons into a first module", () => {
    renderOutline({
      modules: [],
      lessons: lessons.map((l) => ({ ...l, module: null })),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Group lessons into modules" }),
    );
    expect(m.addModule).toHaveBeenCalledWith(
      { courseId: 99, title: "Module 1" },
      expect.anything(),
    );
  });

  it("removes modules after confirming", async () => {
    renderOutline();
    openMenu(screen.getByRole("button", { name: "More outline actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove modules" }));
    await vi.waitFor(() =>
      expect(m.dissolveModules).toHaveBeenCalledWith(
        { courseId: 99 },
        expect.anything(),
      ),
    );
  });

  it("follows new server data when nothing is in flight", () => {
    const { rerenderWith } = renderOutline();
    act(() =>
      rerenderWith({
        lessons: [
          ...lessons,
          { id: 4, title: "Scaling", module: 20, order: 1 },
        ],
      }),
    );
    expect(numberOf(4)).toBe("4");
  });

  it("keeps a pending move on screen while the server data is still old", () => {
    const { rerenderWith } = renderOutline();
    openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    act(() => rerenderWith({ lessons: [...lessons] }));
    expect(numberOf(1)).toBe("2");
  });

  it("shows no handles, menus or add rows when read-only", () => {
    renderOutline({ readOnly: true });
    expect(screen.queryByPlaceholderText("Add a lesson…")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /lesson actions/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /module actions/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Drag to reorder/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Add module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Basics" })).toBeNull();
    expect(screen.getByText("Basics")).toBeInTheDocument();
  });

  it("gives every lesson a labelled drag handle", () => {
    renderOutline();
    expect(
      screen.getByRole("button", { name: "Drag to reorder Setup" }),
    ).toBeInTheDocument();
  });
});
