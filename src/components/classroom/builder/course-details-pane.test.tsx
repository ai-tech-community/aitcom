import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { createCourseWriter } from "./course-writer";
import type { PaneSaveState } from "./course-builder";

const trpc = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  setData: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ classrooms: { get: { setData: trpc.setData } } }),
    classrooms: {
      update: { useMutation: () => ({ mutateAsync: trpc.mutateAsync }) },
    },
  },
}));

import { CourseDetailsPane } from "./course-details-pane";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";

const course = {
  id: 7,
  slug: "intro-1",
  title: "Intro to agents",
  summary: null,
  coverImageUrl: null,
  isPublic: false,
};

function renderPane(readOnly = false) {
  const onStatusChange = vi.fn<(s: PaneSaveState) => void>();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseDetailsPane
        course={course}
        writer={createCourseWriter(T0)}
        readOnly={readOnly}
        onStatusChange={onStatusChange}
      />
    </NextIntlClientProvider>,
  );
  return { onStatusChange };
}

const lastStatus = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.at(-1)?.[0] as PaneSaveState | undefined)?.status;

beforeEach(() => {
  vi.useFakeTimers();
  trpc.mutateAsync.mockReset();
  trpc.setData.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("CourseDetailsPane", () => {
  it("sends expectedUpdatedAt and chains the version each save returns", async () => {
    trpc.mutateAsync
      .mockResolvedValueOnce({ ok: true, updatedAt: T1 })
      .mockResolvedValueOnce({ ok: true, updatedAt: T2 });
    const { onStatusChange } = renderPane();

    fireEvent.change(screen.getByLabelText("Course title"), {
      target: { value: "Agents from scratch" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.change(screen.getByLabelText("Short summary"), {
      target: { value: "Build one." },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(trpc.mutateAsync).toHaveBeenCalledTimes(2);
    expect(trpc.mutateAsync.mock.calls[0]![0]).toEqual({
      courseId: 7,
      title: "Agents from scratch",
      summary: "",
      coverImageUrl: null,
      expectedUpdatedAt: T0,
    });
    expect(trpc.mutateAsync.mock.calls[1]![0]).toMatchObject({
      summary: "Build one.",
      expectedUpdatedAt: T1,
    });
    expect(trpc.setData).toHaveBeenCalledWith(
      { slug: "intro-1" },
      expect.any(Function),
    );
    expect(lastStatus(onStatusChange)).toBe("saved");
  });

  it("does not save a title under 3 characters and says why", async () => {
    const { onStatusChange } = renderPane();

    fireEvent.change(screen.getByLabelText("Course title"), {
      target: { value: "ab" },
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(trpc.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Use at least 3 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Course title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(lastStatus(onStatusChange)).toBe("dirty");
  });

  it("reports a conflict when the course changed elsewhere", async () => {
    trpc.mutateAsync.mockRejectedValueOnce(new Error("COURSE_CHANGED"));
    const { onStatusChange } = renderPane();

    fireEvent.change(screen.getByLabelText("Course title"), {
      target: { value: "Agents from scratch" },
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(lastStatus(onStatusChange)).toBe("conflict");
  });

  it("is fully read-only for an archived course", async () => {
    renderPane(true);

    expect(screen.getByLabelText("Course title")).toBeDisabled();
    expect(screen.getByLabelText("Short summary")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add a cover" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(trpc.mutateAsync).not.toHaveBeenCalled();
  });
});
