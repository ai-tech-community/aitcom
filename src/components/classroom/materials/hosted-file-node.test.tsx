import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  $createParagraphNode,
  $getRoot,
  createEditor,
} from "@payloadcms/richtext-lexical/lexical";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  upload: vi.fn(),
  cancel: vi.fn(),
  files: [] as unknown[] | undefined,
  filesFailed: false,
  refetchFiles: vi.fn(),
  state: { step: "idle" } as { step: string; share?: number },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    classroomMaterials: {
      listCourseMaterials: {
        useQuery: () => ({
          data: m.files,
          isError: m.filesFailed,
          refetch: m.refetchFiles,
        }),
      },
    },
  },
}));
vi.mock("./use-file-upload", () => ({
  useFileUpload: () => ({
    state: m.state,
    upload: m.upload,
    cancel: m.cancel,
  }),
}));

import { RichTextEditor } from "@/components/article-editor/rich-text-editor";
import {
  postprocessEditorState,
  preprocessEditorState,
} from "@/components/article-editor/utils";
import {
  hostedFileBlockNode,
  stripIncompleteMaterials,
} from "@/lib/classroom/lesson-body";
import en from "../../../../messages/en.json";
import {
  classroomEditorExtensions,
  classroomEditorExtensionsWithUploads,
} from "./editor-extensions";
import { $createHostedFileNode, HostedFileNode } from "./hosted-file-node";
import { LessonEditorProvider } from "./lesson-editor-context";

type Node = {
  type?: string;
  fields?: { blockType?: string; materialId?: unknown; id?: string };
  children?: Node[];
};

function hostedFileIds(state: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (nodes?: Node[]) => {
    for (const n of nodes ?? []) {
      if (n.type === "block" && n.fields?.blockType === "HostedFile") {
        out.push(n.fields.materialId);
      }
      walk(n.children);
    }
  };
  walk((state as { root?: { children?: Node[] } } | null)?.root?.children);
  return out;
}

function newEditor() {
  return createEditor({
    namespace: "hosted-file-node-test",
    nodes: [HostedFileNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("HostedFileNode ↔ stored HostedFile block", () => {
  it("saves a node with a file as exactly the stored block shape", () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot().append($createHostedFileNode(42), $createParagraphNode());
      },
      { discrete: true },
    );
    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
      classroomEditorExtensions,
    ) as unknown as { root: { children: Node[] } };
    const first = saved.root.children[0]!;
    expect(first).toEqual(hostedFileBlockNode(42, first.fields!.id!));
    expect(first.fields!.id).toMatch(/^[a-f0-9]{12}$/);
  });

  it("loads a stored block into a HostedFileNode and saves it back unchanged", () => {
    const stored = {
      root: {
        type: "root",
        format: "",
        indent: 0,
        version: 1,
        direction: null,
        children: [hostedFileBlockNode(7, "abc123def456")],
      },
    };
    const editor = newEditor();
    editor.setEditorState(
      editor.parseEditorState(
        preprocessEditorState(stored as never, classroomEditorExtensions)!,
      ),
    );
    const node = editor.getEditorState().read(() => $getRoot().getFirstChild());
    expect(node).toBeInstanceOf(HostedFileNode);
    const saved = postprocessEditorState(
      editor.getEditorState().toJSON(),
      classroomEditorExtensions,
    ) as unknown as { root: { children: unknown[] } };
    expect(saved.root.children).toEqual([
      hostedFileBlockNode(7, "abc123def456"),
    ]);
  });

  it("a node that never got a file is dropped before saving", () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot().append($createHostedFileNode(), $createParagraphNode());
      },
      { discrete: true },
    );
    const saved = stripIncompleteMaterials(
      postprocessEditorState(
        editor.getEditorState().toJSON(),
        classroomEditorExtensions,
      ),
    );
    expect(hostedFileIds(saved)).toEqual([]);
  });
});

describe("lesson editor: adding a file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.files = [];
    m.filesFailed = false;
    m.state = { step: "idle" };
    m.upload.mockResolvedValue({ id: 42 });
  });

  function renderEditor(
    extensions: typeof classroomEditorExtensions,
    onChange = vi.fn(),
  ) {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LessonEditorProvider value={{ courseId: 5, canUpload: true }}>
          <RichTextEditor onChange={onChange} extensions={extensions} />
        </LessonEditorProvider>
      </NextIntlClientProvider>,
    );
    return onChange;
  }

  async function insertFileBlock() {
    const button = await screen.findByTitle("Add a file");
    await waitFor(() => expect(button).toBeEnabled());
    const editable = document.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    act(() => {
      editable.focus();
      fireEvent.click(editable);
    });
    fireEvent.click(button);
  }

  it("uploads the picked file and puts its id into the saved lesson body", async () => {
    const onChange = renderEditor(classroomEditorExtensionsWithUploads);
    await insertFileBlock();
    const input = await screen.findByLabelText(en.classroom.files.chooseFile);
    const file = new File(["%PDF-1.7"], "Week 1.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(m.upload).toHaveBeenCalledWith(file));
    await waitFor(
      () => expect(hostedFileIds(onChange.mock.lastCall?.[0])).toEqual([42]),
      { timeout: 2000 },
    );
  });

  it("reuses a file already in the course", async () => {
    m.files = [
      {
        id: 9,
        title: "Handout",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 10,
        status: "ready",
        visibility: "members",
        failureReason: null,
        createdAt: "2026-09-28T10:00:00.000Z",
      },
    ];
    const onChange = renderEditor(classroomEditorExtensionsWithUploads);
    await insertFileBlock();
    fireEvent.change(
      await screen.findByLabelText(en.classroom.files.reuseLabel),
      { target: { value: "9" } },
    );
    await waitFor(
      () => expect(hostedFileIds(onChange.mock.lastCall?.[0])).toEqual([9]),
      { timeout: 2000 },
    );
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("shows upload progress with its percent, and Cancel stops the upload", async () => {
    renderEditor(classroomEditorExtensionsWithUploads);
    m.state = { step: "uploading", share: 0.42 };
    await insertFileBlock();
    const bar = await screen.findByRole("progressbar", {
      name: "Uploading… 42%",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(m.cancel).toHaveBeenCalledTimes(1);
  });

  it("says the course files didn't load and retries, while upload stays possible", async () => {
    m.files = undefined;
    m.filesFailed = true;
    renderEditor(classroomEditorExtensionsWithUploads);
    await insertFileBlock();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.classroom.files.listFailed,
    );
    expect(
      screen.getByLabelText(en.classroom.files.chooseFile),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: en.classroom.files.tryAgain }),
    );
    expect(m.refetchFiles).toHaveBeenCalledTimes(1);
  });

  it("a chosen file whose details can't load says so with a retry, not an endless placeholder", async () => {
    m.files = undefined;
    m.filesFailed = true;
    renderEditor(classroomEditorExtensionsWithUploads);
    await insertFileBlock();
    fireEvent.change(
      await screen.findByLabelText(en.classroom.files.chooseFile),
      { target: { files: [new File(["%PDF-1.7"], "Week 1.pdf")] } },
    );
    await waitFor(() =>
      expect(screen.queryByLabelText(en.classroom.files.chooseFile)).toBeNull(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      en.classroom.files.listFailed,
    );
    fireEvent.click(
      screen.getByRole("button", { name: en.classroom.files.tryAgain }),
    );
    expect(m.refetchFiles).toHaveBeenCalledTimes(1);
  });

  it("offers no 'Add a file' button without upload rights", async () => {
    renderEditor(classroomEditorExtensions);
    await screen.findByTitle("Embed slides or video");
    expect(screen.queryByTitle("Add a file")).toBeNull();
  });
});
