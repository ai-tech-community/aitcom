// The article editor writing for a community magazine (spec 2026-10-26,
// Task 15): the draft is created for the magazine, the action is "Mark
// ready for an issue", and a ready article returns to the Magazine tab.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/magazines/test-intl";
import { MagazineArticleWorkspace } from "@/components/magazines/editor/magazine-article-workspace";

const calls = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  submit: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      magazines: {
        pickerCandidates: { invalidate: vi.fn() },
        availableArticles: { invalidate: vi.fn() },
        myDraftArticles: { invalidate: vi.fn() },
        myMagazineArticles: { invalidate: vi.fn() },
      },
    }),
    articles: {
      create: { useMutation: () => ({ mutateAsync: calls.create }) },
      update: { useMutation: () => ({ mutateAsync: calls.update }) },
      submit: { useMutation: () => ({ mutateAsync: calls.submit }) },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: calls.push }),
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/**
 * A written article, handed to the editor through its one change seam
 * (Lexical's OnChangePlugin): an intro paragraph, then an h2 — enough to
 * clear the readiness checks.
 */
const WRITTEN = {
  root: {
    type: "root",
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", text: "Why night owls read magazines." }],
      },
      {
        type: "paragraph",
        version: 1,
        children: [
          {
            type: "text",
            text: "![Breakfast](https://aitcommunity.s3.amazonaws.com/day.jpg)",
          },
        ],
      },
      {
        type: "heading",
        tag: "h2",
        version: 1,
        children: [{ type: "text", text: "The first part" }],
      },
    ],
  },
};

vi.mock(
  "@payloadcms/richtext-lexical/lexical/react/LexicalOnChangePlugin",
  () => ({
    OnChangePlugin: ({
      onChange,
    }: {
      onChange: (state: { toJSON: () => unknown }) => void;
    }) => {
      useEffect(() => {
        onChange({ toJSON: () => WRITTEN });
      }, [onChange]);
      return null;
    },
  }),
);

import { ArticleEditor } from "./article-editor";
import type { ArticleDestination } from "./destination";
import type { ArticleEditorProps } from "./types";

const destination: ArticleDestination = {
  kind: "magazine",
  magazineId: 42,
  magazineName: "The Gazette",
  communitySlug: "night-owls",
  handIn: "mark_ready",
};

beforeEach(() => {
  // The editor opens on the magazine's write page.
  window.history.replaceState(
    null,
    "",
    "/en/communities/night-owls/magazine/write",
  );
  calls.create.mockResolvedValue({ id: 7, slug: "night-owls-1" });
  calls.update.mockResolvedValue({ id: 7 });
  calls.submit.mockResolvedValue({ id: 7 });
});

afterEach(() => {
  vi.clearAllMocks();
});

function typeTitle(title: string) {
  fireEvent.change(screen.getByPlaceholderText("Article title..."), {
    target: { value: title },
  });
}

/** Opens the pre-publish dialog; resolves with its action once the checks pass. */
async function openReadyDialog(): Promise<HTMLButtonElement> {
  fireEvent.click(
    screen.getByRole("button", { name: "MARK READY FOR AN ISSUE" }),
  );
  const actions = await screen.findAllByRole<HTMLButtonElement>("button", {
    name: "MARK READY FOR AN ISSUE",
  });
  expect(actions).toHaveLength(2);
  const dialogAction = actions[1]!;
  await waitFor(() => expect(dialogAction.disabled).toBe(false));
  return dialogAction;
}

const savedArticle: NonNullable<ArticleEditorProps["initialData"]> = {
  id: 7,
  slug: "night-owls-1",
  title: "Night owls",
  content: WRITTEN as NonNullable<ArticleEditorProps["initialData"]>["content"],
  type: "article",
  tags: [],
};

describe("ArticleEditor writing for a magazine", () => {
  it("inserts an image from a URL and alt, and edits the cover", async () => {
    renderWithIntl(
      <ArticleEditor isTrustedAuthor={false} destination={destination} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Image" })).toBeEnabled(),
    );
    expect(screen.getByRole("textbox", { name: "Cover image" })).toHaveValue(
      "",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Cover image" }), {
      target: { value: "https://cdn.example.test/cover.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "http://cdn.example.test/a.jpg" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Alt text" }), {
      target: { value: "The square" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(screen.getByText("Use an https image URL.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "https://cdn.example.test/square.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(screen.queryByRole("textbox", { name: "Image URL" })).toBeNull();
  });

  it("shows a save state and a preview of the article", async () => {
    renderWithIntl(
      <ArticleEditor isTrustedAuthor={false} destination={destination} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Draft");
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      screen.getByRole("article", { name: "Article preview" }),
    ).toBeInTheDocument();
    const previewImage = screen.getByRole("img", { name: "Breakfast" });
    expect(previewImage).toHaveAttribute(
      "src",
      "https://aitcommunity.s3.amazonaws.com/day.jpg",
    );
    expect(previewImage).toHaveAttribute("loading", "lazy");
    expect(
      screen.getByRole("button", { name: "Back to editing" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("loads a stored [!INFO] paragraph as a callout and drops empty paragraphs", () => {
    renderWithIntl(
      <ArticleEditor
        isTrustedAuthor={false}
        destination={destination}
        initialData={{
          ...savedArticle,
          content: {
            root: {
              type: "root",
              version: 1,
              children: [
                { type: "paragraph", version: 1, children: [] },
                {
                  type: "paragraph",
                  version: 1,
                  children: [
                    {
                      type: "text",
                      version: 1,
                      text: "[!INFO] Good to know",
                    },
                  ],
                },
                { type: "paragraph", version: 1, children: [] },
                { type: "paragraph", version: 1, children: [] },
                {
                  type: "list",
                  version: 1,
                  listType: "bullet",
                  tag: "ul",
                  start: 1,
                  format: "",
                  indent: 0,
                  direction: "ltr",
                  children: [
                    {
                      type: "listitem",
                      version: 1,
                      value: 1,
                      indent: 0,
                      format: "",
                      direction: "ltr",
                      children: [
                        {
                          type: "paragraph",
                          version: 1,
                          direction: "ltr",
                          format: "",
                          indent: 0,
                          children: [
                            {
                              type: "text",
                              version: 1,
                              detail: 0,
                              format: 0,
                              mode: "normal",
                              style: "",
                              text: "Bring a question",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                { type: "paragraph", version: 1, children: [] },
              ],
            },
          } as unknown as NonNullable<
            ArticleEditorProps["initialData"]
          >["content"],
        }}
      />,
    );
    const callout = document.querySelector("[data-admonition='INFO']");
    expect(callout).not.toBeNull();
    expect(callout).toHaveTextContent("Good to know");
    expect(callout?.textContent).not.toContain("[!INFO]");
    const empty = [
      ...(document.querySelector(".editor-anchor")?.querySelectorAll("p") ??
        []),
    ].filter((paragraph) => !paragraph.textContent?.trim());
    expect(empty).toHaveLength(0);
    expect(screen.getByText("Bring a question")).toBeInTheDocument();
  });

  it("does not save a loaded article just to normalize its paragraphs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithIntl(
        <ArticleEditor
          isTrustedAuthor={false}
          destination={destination}
          initialData={savedArticle}
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(calls.update).not.toHaveBeenCalled();
      expect(calls.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not hand in an existing article when the final update fails", async () => {
    calls.update.mockRejectedValue(new Error("SAVE_FAILED"));
    renderWithIntl(
      <ArticleEditor
        isTrustedAuthor
        destination={destination}
        initialData={savedArticle}
      />,
    );
    const send = await openReadyDialog();
    await act(async () => fireEvent.click(send));
    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    );
    expect(calls.submit).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeVisible();
    expect(calls.push).not.toHaveBeenCalled();
  });

  it("cancels the pending autosave before handing in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithIntl(
        <ArticleEditor
          isTrustedAuthor
          destination={destination}
          initialData={savedArticle}
        />,
      );
      typeTitle("A revised title");
      const send = await openReadyDialog();
      await act(async () => fireEvent.click(send));
      expect(calls.submit).toHaveBeenCalledWith({ id: 7 });
      await act(async () => vi.advanceTimersByTime(1300));
      expect(calls.update).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["changes_requested", undefined])(
    "keeps the editors' note while the writer works (%s)",
    (reviewStatus) => {
      renderWithIntl(
        <ArticleEditor
          isTrustedAuthor
          destination={destination}
          initialData={{
            ...savedArticle,
            reviewStatus,
            reviewNote: "Please explain the example.",
          }}
        />,
      );
      const note = screen.getByText("Please explain the example.");
      expect(note).toBeVisible();
      expect(note.parentElement).toHaveClass(
        "border-border",
        "text-foreground",
      );
      expect(
        note.parentElement!.querySelector('[data-slot="section-label"]'),
      ).toBeInTheDocument();
      expect(note.parentElement!.className).not.toContain("orange");
    },
  );

  it("keeps a saved note hidden on the blog once changes_requested has cleared", () => {
    renderWithIntl(
      <ArticleEditor
        isTrustedAuthor={false}
        initialData={{
          ...savedArticle,
          reviewNote: "Please explain the example.",
        }}
      />,
    );
    expect(screen.queryByText("Please explain the example.")).toBeNull();
  });

  it("a contributor destination renders SEND TO THE EDITORS", () => {
    renderWithIntl(
      <ArticleEditor
        isTrustedAuthor
        destination={{ ...destination, handIn: "send_for_review" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "SEND TO THE EDITORS" }),
    ).toBeInTheDocument();
  });

  it("the magazine workspace carries the contributor through sending to the editors", async () => {
    renderWithIntl(
      <MagazineArticleWorkspace
        communitySlug="night-owls"
        writing={{
          magazineId: 42,
          magazineName: "The Gazette",
          handIn: "send_for_review",
        }}
      />,
    );
    typeTitle("Night owls");
    fireEvent.click(
      screen.getByRole("button", { name: "SEND TO THE EDITORS" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Send to the editors?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Check your article first. You cannot change it while the editors read it. They can approve it, ask for changes or decline it.",
      ),
    ).toBeInTheDocument();
    const actions = screen.getAllByRole<HTMLButtonElement>("button", {
      name: "SEND TO THE EDITORS",
    });
    expect(actions).toHaveLength(2);
    const send = actions[1]!;
    await waitFor(() => expect(send).toBeEnabled());
    expect(screen.queryByRole("button", { name: "PUBLISH" })).toBeNull();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => fireEvent.click(send));
      expect(calls.submit).toHaveBeenCalledWith({ id: 7 });
      expect(calls.create.mock.calls[0]![0]).toMatchObject({ magazineId: 42 });
      expect(
        await screen.findByText(
          "Sent. The editors will read it and let you know.",
        ),
      ).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(1500));
      expect(calls.push).toHaveBeenCalledWith(
        "/communities/night-owls/magazine",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates the draft with the magazine id", async () => {
    renderWithIntl(
      <ArticleEditor isTrustedAuthor={false} destination={destination} />,
    );
    typeTitle("Night owls");

    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(calls.create.mock.calls[0]![0]).toMatchObject({
      title: "Night owls",
      type: "article",
      magazineId: 42,
    });
    // The saved draft's address is the magazine's edit page, not the blog's.
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/en/communities/night-owls/magazine/articles/night-owls-1/edit",
      ),
    );
  });

  it("labels the action 'Mark ready for an issue' and returns to the Magazine tab", async () => {
    // A trusted author still marks ready: magazine articles go live with
    // their issue, never on their own.
    renderWithIntl(<ArticleEditor isTrustedAuthor destination={destination} />);
    typeTitle("Night owls");

    const dialogAction = await openReadyDialog();
    expect(screen.queryByRole("button", { name: "PUBLISH" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "SUBMIT FOR REVIEW" }),
    ).toBeNull();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => {
        fireEvent.click(dialogAction);
      });
      await waitFor(() => expect(calls.submit).toHaveBeenCalledWith({ id: 7 }));
      expect(calls.create.mock.calls[0]![0]).toMatchObject({ magazineId: 42 });
      expect(
        await screen.findByText(
          "Marked ready. An editor can now place it in an issue.",
        ),
      ).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(calls.push).toHaveBeenCalledWith(
        "/communities/night-owls/magazine",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a friendly message, not the server's code, when marking ready is refused", async () => {
    calls.submit.mockRejectedValue(new Error("FORBIDDEN"));
    renderWithIntl(
      <ArticleEditor isTrustedAuthor={false} destination={destination} />,
    );
    typeTitle("Night owls");

    const dialogAction = await openReadyDialog();
    await act(async () => {
      fireEvent.click(dialogAction);
    });
    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeTruthy();
    expect(screen.queryByText("FORBIDDEN")).toBeNull();
    expect(calls.push).not.toHaveBeenCalled();
  });

  it("leaves the blog as it was when no destination is given", async () => {
    window.history.replaceState(null, "", "/en/blog/write");
    renderWithIntl(<ArticleEditor isTrustedAuthor={false} />);
    typeTitle("Night owls");

    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(calls.create.mock.calls[0]![0]).not.toHaveProperty("magazineId");
    expect(
      screen.getByRole("button", { name: "SUBMIT FOR REVIEW" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(window.location.pathname).toBe("/en/blog/edit/night-owls-1"),
    );
  });
});
