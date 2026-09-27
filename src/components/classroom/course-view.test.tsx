import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const AUTHOR = "user-author";

vi.mock("@/trpc/react", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    api: {
      useUtils: () => ({ classrooms: { get: { invalidate: vi.fn() } } }),
      classrooms: {
        get: {
          useQuery: () => ({
            isLoading: false,
            isError: false,
            data: {
              course: {
                id: 7,
                slug: "intro-1",
                title: "Intro to agents",
                authorId: AUTHOR,
                authorName: "Ada",
                status: "draft",
                isPublic: false,
                enrollmentCount: 0,
                summary: null,
                coverImageUrl: null,
              },
              lessons: [
                { id: 1, title: "First steps", module: null, order: 0 },
              ],
              modules: [],
              enrolled: false,
              completedLessonIds: [],
              lessonExams: [],
              attempts: [],
              certificateIssuedAt: null,
              passedCourse: false,
            },
          }),
        },
        enroll: { useMutation: mutation },
        unenroll: { useMutation: mutation },
        markLessonComplete: { useMutation: mutation },
        setPublic: { useMutation: mutation },
        moderateArchive: { useMutation: mutation },
      },
      communities: {
        // The viewer is both the author and a community owner (staff).
        getMyCommunities: {
          useQuery: () => ({
            data: [{ slug: "hub", status: "active", role: "owner" }],
          }),
        },
      },
    },
  };
});
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: AUTHOR } } }) },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ requireAuth: vi.fn() }),
}));
vi.mock("@/lib/lexical", () => ({ LexicalRenderer: () => null }));
vi.mock("./exam-runner", () => ({ ExamRunner: () => null }));

import { CourseView } from "./course-view";

function renderView(embedded: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
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
