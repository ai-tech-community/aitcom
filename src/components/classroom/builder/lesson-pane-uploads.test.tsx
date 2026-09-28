import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    classroomMaterials: {
      listCourseMaterials: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { LessonEditorProvider } from "@/components/classroom/materials/lesson-editor-context";
import { LessonPane, type LessonDraft } from "./lesson-pane";

const draft: LessonDraft = {
  title: "Welcome",
  body: null,
  resources: [],
  exam: { mandatory: false, passThreshold: 70, maxAttempts: 0, questions: [] },
};

/** The real rich-text editor: its toolbar shows what the author may insert. */
function renderPane(canUpload: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LessonEditorProvider value={{ courseId: 5, canUpload }}>
        <LessonPane
          draft={draft}
          setDraft={vi.fn()}
          readOnly={false}
          saveError={null}
        />
      </LessonEditorProvider>
    </NextIntlClientProvider>,
  );
}

describe("LessonPane file uploads", () => {
  it("offers 'Add a file' to an author the community lets upload", async () => {
    renderPane(true);
    expect(await screen.findByTitle("Add a file")).toBeInTheDocument();
    expect(screen.getByTitle("Embed slides or video")).toBeInTheDocument();
  });

  it("offers only embeds to an author who may not upload", async () => {
    renderPane(false);
    expect(
      await screen.findByTitle("Embed slides or video"),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Add a file")).toBeNull();
  });
});
