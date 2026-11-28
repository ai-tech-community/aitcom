import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const AUTHOR = "user-author";
const fixture = vi.hoisted(() => ({
  redesigned: false,
  requestedLesson: "",
  enrolled: false,
  completed: [] as number[],
  lessonCount: 3,
  mandatory: false,
  hasExam: false,
  moduleTitle: null as string | null,
  certificate: null as Date | null,
  errorCode: null as "NOT_FOUND" | "PRECONDITION_FAILED" | null,
  viewer: "user-author" as string | null,
  communityMember: true,
  markComplete: vi.fn(),
  confirm: vi.fn(),
  leave: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => fixture.redesigned,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(fixture.requestedLesson),
}));

vi.mock("@/trpc/react", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    api: {
      useUtils: () => ({
        classrooms: {
          get: { invalidate: vi.fn() },
          list: { invalidate: vi.fn() },
        },
      }),
      classrooms: {
        get: {
          useQuery: () => ({
            isLoading: false,
            isError: Boolean(fixture.errorCode),
            error: fixture.errorCode
              ? { data: { code: fixture.errorCode } }
              : undefined,
            data: {
              course: {
                id: 7,
                slug: "intro-1",
                title: "Intro to agents",
                authorId: AUTHOR,
                authorName: "Ada",
                status: fixture.redesigned ? "published" : "draft",
                isPublic: false,
                enrollmentCount: 0,
                summary: null,
                coverImageUrl: null,
              },
              lessons: [
                {
                  id: 1,
                  title: "First steps",
                  module: fixture.moduleTitle ? 19 : null,
                  order: 0,
                },
                ...(fixture.redesigned
                  ? [
                      {
                        id: 2,
                        title: "Make a plan",
                        module: fixture.moduleTitle ? 19 : null,
                        order: 1,
                      },
                      {
                        id: 3,
                        title: "Review the plan",
                        module: fixture.moduleTitle ? 19 : null,
                        order: 2,
                      },
                    ]
                  : []),
              ].slice(0, fixture.lessonCount),
              modules: fixture.moduleTitle
                ? [{ id: 19, title: fixture.moduleTitle, order: 0 }]
                : [],
              enrolled: fixture.enrolled,
              completedLessonIds: fixture.completed,
              lessonExams: fixture.hasExam
                ? [
                    {
                      lessonId: 2,
                      mandatory: fixture.mandatory,
                      passThreshold: 70,
                      maxAttempts: 0,
                      questions: [
                        {
                          id: "q1",
                          prompt: "Is the plan ready?",
                          type: "boolean",
                          options: ["Yes", "No"],
                        },
                      ],
                    },
                  ]
                : [],
              attempts: [],
              certificateIssuedAt: fixture.certificate,
              passedCourse: false,
            },
          }),
        },
        enroll: { useMutation: mutation },
        unenroll: {
          useMutation: () => ({ mutate: fixture.leave, isPending: false }),
        },
        markLessonComplete: {
          useMutation: () => ({
            mutate: fixture.markComplete,
            mutateAsync: fixture.markComplete,
            isPending: false,
          }),
        },
        setPublic: { useMutation: mutation },
        moderateArchive: { useMutation: mutation },
        submitExamAttempt: { useMutation: mutation },
      },
      communities: {
        // The viewer is both the author and a community owner (staff).
        getMyCommunities: {
          useQuery: () => ({
            data:
              fixture.viewer && fixture.communityMember
                ? [
                    {
                      slug: "hub",
                      status: "active",
                      role: fixture.viewer === AUTHOR ? "owner" : "member",
                    },
                  ]
                : [],
          }),
        },
      },
    },
  };
});
vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: fixture.viewer ? { user: { id: fixture.viewer } } : null,
    }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: fixture.push, replace: fixture.replace }),
  Link: ({
    scroll,
    onNavigate,
    ...props
  }: React.ComponentProps<"a"> & {
    scroll?: boolean;
    onNavigate?: () => void;
  }) => {
    void scroll;
    void onNavigate;
    return <a {...props} />;
  },
}));
vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => fixture.confirm,
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ requireAuth: vi.fn() }),
}));
vi.mock("@/lib/lexical", () => ({ LexicalRenderer: () => null }));

import { CourseView } from "./course-view";

function renderView(embedded: boolean) {
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <CourseView slug="hub" courseSlug="intro-1" embedded={embedded} />
    </NextIntlClientProvider>,
  );
}

describe("CourseView embedded in the builder", () => {
  it("is a pure learner preview: no author or staff controls, no page h1", () => {
    renderView(true);
    expect(screen.getByText(/Preview mode/)).toBeInTheDocument();
    for (const name of [
      "Exit preview",
      "Preview",
      "Make public",
      "Make members-only",
      "Archive course",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: /Edit course/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(
      screen.getAllByRole("heading", { level: 2, name: "Intro to agents" })
        .length,
    ).toBeGreaterThan(0);
  });

  it("keeps the author and staff controls on the normal course page", () => {
    renderView(false);
    expect(screen.getByRole("button", { name: /Preview/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make public" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Edit course/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Intro to agents" }),
    ).toBeInTheDocument();
  });
});

describe("redesigned Classroom", () => {
  function setUp(options: Partial<typeof fixture> = {}) {
    Object.assign(fixture, {
      redesigned: true,
      enrolled: true,
      viewer: "user-learner",
      communityMember: true,
      completed: [1],
      lessonCount: 3,
      mandatory: false,
      hasExam: false,
      moduleTitle: null,
      requestedLesson: "",
      certificate: null,
      errorCode: null,
      ...options,
    });
    fixture.markComplete
      .mockReset()
      .mockImplementation(async ({ completed }: { completed: boolean }) => ({
        completed,
      }));
    fixture.confirm.mockReset();
    fixture.leave.mockClear();
    fixture.push.mockClear();
    fixture.replace.mockClear();
    renderView(false);
  }

  it("resumes at the next incomplete lesson using existing completions", () => {
    setUp();
    expect(
      screen.getByRole("heading", { level: 1, name: "Intro to agents" }),
    ).toBeVisible();
    expect(screen.getByText("1 of 3 lessons complete")).toBeVisible();
    const nextTag = screen.getByText("Next", { exact: true });
    expect(nextTag).toBeVisible();
    const next = nextTag.closest("a");
    expect(next).toHaveTextContent("Make a plan");
    expect(next).toHaveAttribute(
      "href",
      "/communities/hub/classroom/intro-1?lesson=2",
    );
    expect(screen.getByRole("link", { name: "Courses" })).toHaveAttribute(
      "href",
      "/communities/hub/classroom",
    );
    expect(screen.queryByText("Members only", { exact: true })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Resume: Make a plan" }),
    ).toHaveAttribute("href", "/communities/hub/classroom/intro-1?lesson=2");
    expect(screen.queryByRole("link", { name: "Edit course" })).toBeNull();
  });

  it("uses the saved author title for the course curriculum", () => {
    setUp({ moduleTitle: "Record and verify the repair" });
    expect(
      screen.getByRole("heading", { name: "Record and verify the repair" }),
    ).toBeVisible();
    expect(screen.queryByText("Module 1")).toBeNull();
  });

  it("uses the saved author title in the player rail and lesson heading context", () => {
    setUp({
      moduleTitle: "Record and verify the repair",
      requestedLesson: "lesson=2",
    });
    const rail = screen.getByRole("navigation", {
      name: "Curriculum",
    });
    expect(
      within(rail).getByRole("heading", {
        name: "Record and verify the repair",
      }),
    ).toBeVisible();
    const lesson = screen.getByRole("article", { name: "Make a plan" });
    expect(
      within(lesson).getByText("Record and verify the repair"),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Course overview" }),
    ).toHaveAttribute("href", "/communities/hub/classroom/intro-1");
  });

  it("advances only after a linked lesson is marked complete", async () => {
    setUp({ requestedLesson: "lesson=2" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Make a plan" }),
    ).toBeVisible();
    expect(screen.getByText("Lesson 2 of 3")).toBeVisible();
    const skip = screen.getByRole("navigation", {
      name: "Skip between lessons",
    });
    expect(within(skip).getAllByRole("link")).toHaveLength(2);
    expect(within(skip).queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Next lesson" })).toHaveAttribute(
      "href",
      "/communities/hub/classroom/intro-1?lesson=3",
    );
    expect(
      screen.getByRole("link", { name: "Previous lesson" }),
    ).toHaveAttribute("href", "/communities/hub/classroom/intro-1?lesson=1");
    fireEvent.click(
      screen.getByRole("button", { name: "Complete and continue" }),
    );
    expect(fixture.markComplete).toHaveBeenCalledWith({
      lessonId: 2,
      completed: true,
    });
    await waitFor(() =>
      expect(fixture.push).toHaveBeenCalledWith(
        "/communities/hub/classroom/intro-1?lesson=3",
        { scroll: false },
      ),
    );
  });

  it("does not advance on a failed save", async () => {
    setUp({ requestedLesson: "lesson=2" });
    fixture.markComplete.mockRejectedValueOnce(new Error("write failed"));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete and continue" }),
    );
    await waitFor(() => expect(fixture.markComplete).toHaveBeenCalledOnce());
    expect(fixture.push).not.toHaveBeenCalled();
  });

  it.each([
    { lesson: 3, completed: [1, 2] },
    { lesson: 1, completed: [2, 3] },
  ])(
    "opens the finish screen after saving the only unfinished lesson ($lesson)",
    async ({ lesson, completed }) => {
      setUp({ requestedLesson: `lesson=${lesson}`, completed });
      fireEvent.click(screen.getByRole("button", { name: "Complete course" }));
      await waitFor(() =>
        expect(fixture.push).toHaveBeenCalledWith(
          "/communities/hub/classroom/intro-1?complete=1",
          { scroll: false },
        ),
      );
    },
  );

  it("completes only the final lesson and returns to the first unfinished lesson", async () => {
    setUp({ requestedLesson: "lesson=3", completed: [] });
    fireEvent.click(screen.getByRole("button", { name: "Complete lesson" }));
    expect(fixture.markComplete).toHaveBeenCalledWith({
      lessonId: 3,
      completed: true,
    });
    await waitFor(() =>
      expect(fixture.push).toHaveBeenCalledWith(
        "/communities/hub/classroom/intro-1?lesson=1",
        { scroll: false },
      ),
    );
  });

  it("shows the overview when a completion link is opened before the course is finished", () => {
    setUp({ requestedLesson: "complete=1", completed: [1, 2] });
    expect(
      screen.getByRole("heading", { name: "Intro to agents" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Course complete" }),
    ).toBeNull();
  });

  it("links to the existing certificate section when a certificate was issued", () => {
    setUp({
      requestedLesson: "complete=1",
      completed: [1, 2, 3],
      certificate: new Date("2026-11-28T00:00:00Z"),
    });
    expect(
      screen.getByRole("heading", { name: "Course complete" }),
    ).toBeVisible();
    const certificate = screen.getByRole("link", { name: "View certificate" });
    expect(certificate).toHaveAttribute(
      "href",
      "/members/user-learner/work#certificates",
    );
    expect(certificate).toHaveAttribute("data-variant", "default");
    const courses = screen.getByRole("link", { name: "Back to courses" });
    expect(courses).toHaveAttribute("href", "/communities/hub/classroom");
    expect(courses).toHaveAttribute("data-variant", "ghost");
  });

  it("makes Browse courses the sole action when there is no issued certificate", () => {
    setUp({ requestedLesson: "complete=1", completed: [1, 2, 3] });
    const browse = screen.getByRole("link", { name: "Browse courses" });
    expect(browse).toHaveAttribute("data-variant", "default");
    expect(browse).toHaveAttribute("href", "/communities/hub/classroom");
    expect(screen.queryByRole("link", { name: "Back to courses" })).toBeNull();
  });

  it("resolves a featured resume link against the current saved lesson progress", () => {
    setUp({ requestedLesson: "resume=1" });
    expect(fixture.replace).toHaveBeenCalledWith(
      "/communities/hub/classroom/intro-1?lesson=2",
      { scroll: false },
    );
  });

  it.each([
    { mandatory: true, communityMember: true, variant: "default" },
    { mandatory: true, communityMember: false, variant: "ink" },
    { mandatory: false, communityMember: true, variant: "outline" },
  ])(
    "uses $variant for exam submission (mandatory: $mandatory, member: $communityMember)",
    ({ mandatory, communityMember, variant }) => {
      setUp({
        requestedLesson: "lesson=2",
        hasExam: true,
        mandatory,
        communityMember,
      });
      fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
      const submit = screen.getByRole("button", { name: "Submit exam" });
      expect(submit).toBeEnabled();
      expect(submit).toHaveAttribute("data-variant", variant);
      expect(
        Boolean(
          screen.queryByRole("button", { name: "Complete and continue" }),
        ),
      ).toBe(!mandatory);
    },
  );

  it("supports undoing completion without losing the next lesson", () => {
    setUp({ requestedLesson: "lesson=2", completed: [1, 2] });
    const footer = within(screen.getByRole("article", { name: "Make a plan" }));
    expect(footer.getByRole("status")).toHaveTextContent("Lesson complete");
    expect(footer.getByRole("link", { name: "Next lesson" })).toBeVisible();
    fireEvent.click(footer.getByRole("button", { name: "Mark incomplete" }));
    expect(fixture.markComplete).toHaveBeenCalledWith({
      lessonId: 2,
      completed: false,
    });
  });

  it("shows the course outline but never opens a lesson for a signed-out viewer", () => {
    setUp({
      enrolled: false,
      viewer: null,
      completed: [],
      requestedLesson: "lesson=2",
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Intro to agents" }),
    ).toBeVisible();
    expect(screen.getByText("Make a plan")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Make a plan" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Enroll" })).toHaveLength(1);
    expect(screen.getByText("Enroll to open the lessons below.")).toBeVisible();
  });
  describe.each([
    ["overview", ""],
    ["first lesson", "lesson=1"],
    ["final lesson", "lesson=2"],
  ])("earlier certificate on the %s", (_surface, requestedLesson) => {
    it.each([0, 50])("uses quiet issuance copy at %i%% progress", (percent) => {
      setUp({
        requestedLesson,
        completed: percent === 0 ? [] : [1],
        lessonCount: 2,
        certificate: new Date("2026-11-28T00:00:00Z"),
      });
      for (const progress of screen.getAllByRole("progressbar", {
        name: "Course progress",
      })) {
        expect(progress).toHaveAttribute("aria-valuenow", String(percent));
      }
      expect(
        screen.getByText("Certificate issued earlier · Nov 28, 2026"),
      ).toBeVisible();
      expect(screen.queryByText("Certificate earned")).toBeNull();
    });
  });

  it("reports an earned certificate on the fully completed overview", () => {
    setUp({
      completed: [1, 2, 3],
      certificate: new Date("2026-11-28T00:00:00Z"),
    });
    expect(screen.getByText("Certificate earned")).toBeVisible();
    expect(screen.queryByText(/Certificate issued earlier/)).toBeNull();
  });

  it.each([false, true])(
    "asks before leaving from Course actions (confirmed: %s)",
    async (confirmed) => {
      setUp();
      fixture.confirm.mockResolvedValueOnce(confirmed);
      expect(screen.queryByRole("button", { name: "Leave course" })).toBeNull();
      const trigger = screen.getByRole("button", { name: "Course actions" });
      fireEvent.keyDown(trigger, { key: "Enter" });
      const action = await screen.findByRole("menuitem", {
        name: "Leave course",
      });
      fireEvent.click(action);
      await waitFor(() =>
        expect(fixture.confirm).toHaveBeenCalledWith(
          expect.objectContaining({
            confirmLabel: "Leave course",
            destructive: true,
          }),
        ),
      );
      if (confirmed)
        expect(fixture.leave).toHaveBeenCalledWith({ courseId: 7 });
      else expect(fixture.leave).not.toHaveBeenCalled();
    },
  );

  it("keeps the issued certificate reachable from a linked lesson", () => {
    setUp({
      requestedLesson: "lesson=2",
      completed: [1, 2, 3],
      certificate: new Date("2026-11-28T00:00:00Z"),
    });
    expect(screen.getByText("Certificate earned")).toBeVisible();
    expect(screen.getByText("Issued Nov 28, 2026")).toBeVisible();
  });

  it("honors denied access even when the query retains cached lessons", () => {
    setUp({ requestedLesson: "lesson=2", errorCode: "NOT_FOUND" });
    expect(screen.getByText("Course not found.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Make a plan" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Complete and continue" }),
    ).toBeNull();
  });
});
