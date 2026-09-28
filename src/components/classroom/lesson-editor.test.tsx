import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ classrooms: { get: { invalidate: vi.fn() } } }),
    classrooms: {
      addLesson: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    classroomMaterials: {
      listCourseMaterials: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { LessonEditor } from "./lesson-editor";

function renderEditor(canUpload: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LessonEditor
        courseId={5}
        lessons={[]}
        modules={[]}
        canUpload={canUpload}
      />
    </NextIntlClientProvider>,
  );
}

describe("LessonEditor", () => {
  it("offers 'Add a file' to an author the community lets upload", async () => {
    renderEditor(true);
    expect(await screen.findByTitle("Add a file")).toBeInTheDocument();
    expect(screen.getByTitle("Embed slides or video")).toBeInTheDocument();
  });

  it("offers only embeds to an author who may not upload", async () => {
    renderEditor(false);
    expect(
      await screen.findByTitle("Embed slides or video"),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Add a file")).toBeNull();
  });
});
