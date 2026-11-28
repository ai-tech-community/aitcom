import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { CourseCatalog } from "./course-catalog";

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    classrooms: {
      get: {
        useQuery: () => ({
          isLoading: false,
          data: {
            enrolled: true,
            completedLessonIds: [1],
            lessons: [
              { id: 1, title: "First steps" },
              { id: 2, title: "Make a plan" },
            ],
          },
        }),
      },
    },
  },
}));

type Course = React.ComponentProps<typeof CourseCatalog>["courses"][number];

function course(id: number, title: string, progressPercent: number): Course {
  return {
    id,
    title,
    progressPercent,
    slug: `course-${id}`,
    authorId: "user-author",
    authorName: "Ada",
    communityId: "community-1",
    enrollmentCount: 2,
    isPublic: false,
    status: "published",
    createdAt: "2026-11-28T00:00:00Z",
    updatedAt: "2026-11-28T00:00:00Z",
  };
}

function renderCatalog(courses: Course[], mayCreate = false) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseCatalog
        slug="hub"
        courses={courses}
        loading={false}
        failed={false}
        mayCreate={mayCreate}
        member
        onRetry={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("CourseCatalog", () => {
  it("shows in-progress courses first and lists every course once", () => {
    renderCatalog([
      course(1, "A new course", 0),
      course(2, "An active course", 25),
    ]);

    const resume = screen.getByRole("heading", { name: "Continue learning" });
    expect(resume).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Resume: Make a plan" }),
    ).toHaveAttribute("data-variant", "default");
    const row = screen.getByRole("link", { name: /An active course/ });
    expect(row).toHaveAttribute("href", "/communities/hub/classroom/course-2");
    expect(
      within(row.closest("section")!).getByRole("progressbar", {
        name: "Course progress",
      }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/communities/hub/classroom/course-2",
      "/communities/hub/classroom/course-2?resume=1",
      "/communities/hub/classroom/course-1",
    ]);
  });

  it("gives an empty catalog a next step based on course creation access", () => {
    renderCatalog([], true);
    expect(screen.getByText("No courses yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create course" })).toHaveAttribute(
      "href",
      "/communities/hub/classroom/new",
    );
  });
});
