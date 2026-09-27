import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

type QueryState = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: { data?: { code?: string } } | null;
  refetch: () => void;
};

const trpc = vi.hoisted(() => ({
  query: null as unknown as QueryState,
  mutateAsync: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      classrooms: { get: { invalidate: vi.fn(), setData: vi.fn() } },
    }),
    classrooms: {
      get: { useQuery: () => trpc.query },
      update: { useMutation: () => ({ mutateAsync: trpc.mutateAsync }) },
    },
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/classroom/course-view", () => ({
  CourseView: () => null,
}));

import {
  CourseBuilder,
  combineSaveStates,
  type PaneSaveState,
} from "./course-builder";

function pane(
  status: PaneSaveState["status"],
  savedAt: Date | null = null,
): PaneSaveState {
  return {
    status,
    savedAt,
    retry: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(status),
  };
}

describe("combineSaveStates", () => {
  it("is idle with no panes", () => {
    expect(combineSaveStates([]).status).toBe("idle");
  });

  it("shows the most urgent state of any pane", () => {
    expect(combineSaveStates([pane("saved"), pane("dirty")]).status).toBe(
      "dirty",
    );
    expect(combineSaveStates([pane("dirty"), pane("saving")]).status).toBe(
      "saving",
    );
    expect(combineSaveStates([pane("saving"), pane("error")]).status).toBe(
      "error",
    );
    expect(combineSaveStates([pane("error"), pane("conflict")]).status).toBe(
      "conflict",
    );
    expect(combineSaveStates([pane("idle"), pane("saved")]).status).toBe(
      "saved",
    );
  });

  it("shows the most recent save time", () => {
    const early = new Date("2026-01-01T00:00:00Z");
    const late = new Date("2026-01-01T00:05:00Z");
    expect(
      combineSaveStates([
        pane("saved", late),
        pane("saved", early),
        pane("idle"),
      ]).savedAt,
    ).toBe(late);
  });

  it("retries only the panes whose save failed", async () => {
    const failed = pane("error");
    const fine = pane("saved");
    await combineSaveStates([failed, fine]).retry();
    expect(failed.retry).toHaveBeenCalledTimes(1);
    expect(fine.retry).not.toHaveBeenCalled();
  });
});

const courseData = {
  course: {
    id: 7,
    slug: "intro-1",
    title: "Intro to agents",
    summary: null,
    coverImageUrl: null,
    isPublic: false,
    status: "draft",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  lessons: [],
  modules: [],
};

function renderBuilder() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseBuilder slug="hub" courseSlug="intro-1" />
    </NextIntlClientProvider>,
  );
}

describe("CourseBuilder loading states", () => {
  beforeEach(() => {
    trpc.mutateAsync.mockReset();
  });

  it("keeps the workspace when a background refetch fails", () => {
    trpc.query = {
      data: courseData,
      isLoading: false,
      isError: true,
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
      refetch: vi.fn(),
    };
    renderBuilder();
    expect(screen.getByLabelText("Course title")).toHaveValue(
      "Intro to agents",
    );
    expect(screen.queryByText("Couldn't load this")).toBeNull();
  });

  it("shows an error with retry when the first load fails", () => {
    trpc.query = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
      refetch: vi.fn(),
    };
    renderBuilder();
    expect(screen.getByText("Couldn't load this")).toBeInTheDocument();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(trpc.query.refetch).toHaveBeenCalledTimes(1);
  });

  it("says the course is missing when it was not found", () => {
    trpc.query = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { code: "NOT_FOUND" } },
      refetch: vi.fn(),
    };
    renderBuilder();
    expect(
      screen.getByText("We couldn't find this course."),
    ).toBeInTheDocument();
  });
});
