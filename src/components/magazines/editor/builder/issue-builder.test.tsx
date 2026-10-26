import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorItemView, ItemProblem } from "@/lib/magazines/item-views";
import type { MagazineIssue } from "@/payload-types";

import { eventView } from "../../test-fixtures";
import { renderWithIntl } from "../../test-intl";

const T0 = "2026-10-20T10:00:00.000Z";
const T1 = "2026-10-20T10:00:05.000Z";
const T2 = "2026-10-20T10:00:09.000Z";

type EditingData = {
  issue: MagazineIssue;
  items: EditorItemView[];
  storedItems: unknown[];
  problems: ItemProblem[];
  magazine: { name: string; slug: string };
  communityIsPrivate: boolean;
  community: { name: string; slug: string; isListedInDirectory: boolean };
  editableArticles: { id: number; slug: string }[];
};

const trpc = vi.hoisted(() => ({
  editing: null as unknown,
  refetch: vi.fn(),
  candidates: [] as unknown[],
  updateIssue: vi.fn(),
  setIssueItems: vi.fn(),
  publishIssue: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// Lexical does not need to run here: rich text is a plain textarea that
// takes its name the way the real writing surface does.
vi.mock("@/components/article-editor/rich-text-editor", () => ({
  RichTextEditor: ({
    onChange,
    placeholder,
    ariaLabelledBy,
    ariaDescribedBy,
  }: {
    onChange: (state: unknown) => void;
    placeholder?: string;
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
  }) => (
    <textarea
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      placeholder={placeholder}
      onChange={(e) =>
        onChange({
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: e.target.value }],
              },
            ],
          },
        })
      }
    />
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      magazines: { pickerCandidates: { invalidate: trpc.invalidate } },
    }),
    magazines: {
      getIssueForEditing: {
        useQuery: () => ({
          data: trpc.editing,
          dataUpdatedAt: 1,
          isLoading: false,
          isError: false,
          refetch: trpc.refetch,
        }),
      },
      pickerCandidates: {
        useQuery: () => ({
          data: trpc.candidates,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      updateIssue: { useMutation: () => ({ mutateAsync: trpc.updateIssue }) },
      setIssueItems: {
        useMutation: () => ({ mutateAsync: trpc.setIssueItems }),
      },
      publishIssue: {
        useMutation: () => ({ mutateAsync: trpc.publishIssue }),
      },
    },
  },
}));

import { IssueBuilder } from "./issue-builder";

function issue(overrides: Partial<MagazineIssue> = {}): MagazineIssue {
  return {
    id: 5,
    magazine: 3,
    communityId: "c1",
    number: 2,
    title: "Summer",
    slug: "summer",
    coverImageUrl: null,
    editorNote: null,
    layout: "cover-story",
    visibility: "members",
    publicConfirmedBy: null,
    publicConfirmedAt: null,
    status: "draft",
    items: [],
    updatedAt: T0,
    createdAt: T0,
    ...overrides,
  } as MagazineIssue;
}

function articleView(itemId: string, id: number, title: string) {
  return {
    kind: "article" as const,
    itemId,
    intro: null,
    article: {
      id,
      slug: `story-${id}`,
      title,
      authorName: "Ada",
      excerpt: `${title} excerpt`,
      readingMinutes: 3,
      imageUrl: null,
    },
  };
}

/** An issue with two saved articles. */
function twoArticles(overrides: Partial<EditingData> = {}): EditingData {
  return {
    issue: issue(),
    items: [
      articleView("blk-1", 11, "First story"),
      articleView("blk-2", 12, "Second story"),
    ],
    storedItems: [
      { kind: "article", id: "blk-1", articleId: 11 },
      { kind: "article", id: "blk-2", articleId: 12 },
    ],
    problems: [],
    magazine: { name: "The Gazette", slug: "gazette" },
    communityIsPrivate: false,
    community: {
      name: "Night Owls",
      slug: "night-owls",
      isListedInDirectory: true,
    },
    editableArticles: [],
    ...overrides,
  };
}

function readyArticle(id: number, title: string, editableByViewer = false) {
  return {
    input: { kind: "article" as const, articleId: id },
    reference: `article:${id}`,
    title,
    facts: [{ type: "byline" as const, name: "Bo" }],
    openHref: editableByViewer
      ? `/communities/night-owls/magazine/articles/story-${id}/edit`
      : null,
  };
}

/** Two native clicks before React re-renders between them. */
function clickAddTwice(name: string) {
  const button = screen.getByRole("button", { name });
  act(() => {
    button.click();
    button.click();
  });
}

/** Picks an item from an open row menu. */
async function pickMenuItem(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name }));
  });
}

/** A tRPC refusal as the client sees it. */
function refusal(code: string, itemIndex: number | null = null) {
  return Object.assign(new Error(code), {
    data: { magazineItemIndex: itemIndex },
  });
}

function renderBuilder() {
  return renderWithIntl(
    <IssueBuilder communitySlug="night-owls" issueId={5} />,
  );
}

/** Lets the autosave debounce fire and its saves settle. */
async function settleSaves() {
  await act(() => vi.advanceTimersByTimeAsync(1500));
}

async function openRowMenu(title: string) {
  await act(async () => {
    fireEvent.keyDown(
      screen.getByRole("button", { name: `Actions for ${title}` }),
      { key: "Enter" },
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  trpc.editing = twoArticles();
  trpc.candidates = [];
  trpc.refetch.mockReset();
  trpc.invalidate.mockReset();
  trpc.updateIssue.mockReset();
  trpc.setIssueItems.mockReset();
  trpc.publishIssue.mockReset();
  trpc.updateIssue.mockImplementation(async (input: { title?: string }) =>
    issue({ ...input, updatedAt: T1 } as Partial<MagazineIssue>),
  );
  trpc.setIssueItems.mockImplementation(
    async (input: { items: { id?: string }[] }) => ({
      issue: issue({
        updatedAt: T2,
        items: input.items.map((item, i) => ({
          ...item,
          id: item.id ?? `new-blk-${i}`,
        })) as MagazineIssue["items"],
      }),
      items: [],
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IssueBuilder", () => {
  it("reorders by the menu and saves the new order with expectedUpdatedAt", async () => {
    renderBuilder();
    await openRowMenu("First story");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    });

    const rows = within(screen.getByRole("list", { name: "In this issue" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows[0]).toContain("Second story");
    expect(rows[1]).toContain("First story");

    await settleSaves();
    expect(trpc.setIssueItems).toHaveBeenCalledTimes(1);
    expect(trpc.setIssueItems).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
      items: [
        { kind: "article", id: "blk-2", articleId: 12 },
        { kind: "article", id: "blk-1", articleId: 11 },
      ],
    });
    expect(trpc.updateIssue).not.toHaveBeenCalled();
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("saves details and items through one queue, each with the version the last save returned", async () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Late summer" },
    });
    await openRowMenu("Second story");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    });

    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
      title: "Late summer",
    });
    // The items save waits for the details save and uses its new version.
    expect(trpc.setIssueItems).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: T1 }),
    );
    expect(screen.queryByText(/changed somewhere else/)).toBeNull();
  });

  it("shows the reload message on ISSUE_CHANGED and keeps local edits", async () => {
    trpc.updateIssue.mockRejectedValue(refusal("ISSUE_CHANGED"));
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My better title" },
    });
    await settleSaves();

    expect(trpc.updateIssue).toHaveBeenCalledTimes(1);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This issue changed somewhere else");
    expect(screen.getByLabelText("Title")).toHaveValue("My better title");

    // Nothing more is sent: the next save would only be refused again.
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My better title!" },
    });
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    });
    expect(trpc.refetch).toHaveBeenCalled();
  });

  it("blocks Publish when visibility is public in a private community until the box is checked", async () => {
    trpc.editing = twoArticles({
      communityIsPrivate: true,
      community: {
        name: "Night Owls",
        slug: "night-owls",
        isListedInDirectory: false,
      },
    });
    renderBuilder();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();

    fireEvent.click(screen.getByRole("radio", { name: "Everyone" }));
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await settleSaves();
    expect(trpc.updateIssue).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand, show this outside the community",
      }),
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
      visibility: "public",
      confirmUnlistedPublic: true,
    });
  });

  it("records the opt-in for an issue already public but unconfirmed in a private community", async () => {
    // Saved `public` before the community became unlisted: no confirmation.
    trpc.editing = twoArticles({
      issue: issue({ visibility: "public" }),
      communityIsPrivate: true,
      community: {
        name: "Night Owls",
        slug: "night-owls",
        isListedInDirectory: false,
      },
    });
    trpc.updateIssue.mockImplementation(async (input: object) =>
      issue({
        ...input,
        publicConfirmedBy: "u1",
        publicConfirmedAt: T1,
        updatedAt: T1,
      } as Partial<MagazineIssue>),
    );
    renderBuilder();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await settleSaves();
    expect(trpc.updateIssue).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand, show this outside the community",
      }),
    );
    await settleSaves();
    // The tick alone is the change: the visibility is sent again with it.
    expect(trpc.updateIssue).toHaveBeenCalledTimes(1);
    expect(trpc.updateIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
      visibility: "public",
      confirmUnlistedPublic: true,
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();

    // Once the server holds the confirmation, nothing more is sent.
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Summer special" },
    });
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledTimes(2);
    expect(trpc.updateIssue).toHaveBeenLastCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T1,
      title: "Summer special",
    });
  });

  it("points at the item a refused save names", async () => {
    trpc.setIssueItems.mockRejectedValue(refusal("ARTICLE_PLACED", 0));
    renderBuilder();
    await openRowMenu("First story");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    });
    await settleSaves();

    // Index 0 of the order that was sent: "Second story".
    const rows = within(
      screen.getByRole("list", { name: "In this issue" }),
    ).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "This article is already in another issue.",
    );
    expect(rows[1]).not.toHaveTextContent("already in another issue");
    expect(screen.getByText("Couldn't save")).toBeVisible();
  });

  it("shows the problems the issue loaded with and blocks Publish on them", async () => {
    trpc.editing = twoArticles({
      problems: [{ itemIndex: 1, code: "ARTICLE_NOT_READY" }],
    });
    renderBuilder();
    const rows = within(
      screen.getByRole("list", { name: "In this issue" }),
    ).getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent(
      "This article is not ready for an issue yet.",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Fix the parts marked in the list."),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Publish" }),
    ).toBeDisabled();
  });

  it("adds a ready article and a text section, saving only finished items", async () => {
    trpc.candidates = [readyArticle(21, "Fresh piece")];
    renderBuilder();
    fireEvent.click(
      screen.getByRole("button", { name: "Add Fresh piece to the issue" }),
    );
    // Radix tabs switch on mouse down.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a text section" }));
    await settleSaves();

    // The empty section stays out of the save until it has text.
    expect(trpc.setIssueItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [
          { kind: "article", id: "blk-1", articleId: 11 },
          { kind: "article", id: "blk-2", articleId: 12 },
          { kind: "article", articleId: 21 },
        ],
      }),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Text" }), {
      target: { value: "Welcome to summer" },
    });
    await settleSaves();
    const last = trpc.setIssueItems.mock.lastCall![0] as {
      items: unknown[];
      expectedUpdatedAt: string;
    };
    expect(last.expectedUpdatedAt).toBe(T2);
    // The article keeps the block id its first save gave it.
    expect(last.items[2]).toEqual({
      kind: "article",
      id: "new-blk-2",
      articleId: 21,
    });
    expect(last.items[3]).toMatchObject({ kind: "editorial" });
  });

  it("opens a new text section with focus in its editor and no error before it is written", async () => {
    renderBuilder();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a text section" }));

    // The keyboard follows the new section to its editor.
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Intro line (optional)" }),
    );
    // Not written yet is not an error yet.
    expect(screen.queryByText(/Write something in this section/)).toBeNull();
    // A change that leaves the text empty (a heading, or the rich-text
    // editor reporting a click) is still not written.
    fireEvent.change(
      screen.getByRole("textbox", { name: "Heading (optional)" }),
      { target: { value: "Opening" } },
    );
    expect(screen.queryByText(/Write something in this section/)).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Heading (optional)" }),
      { target: { value: "" } },
    );

    // Leaving it empty is: the row says so, and its controls read it out.
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const problem =
      "Write something in this section. It is saved once it has text.";
    expect(screen.getByText(problem)).toBeVisible();
    const row = within(
      screen.getByRole("list", { name: "In this issue" }),
    ).getAllByRole("listitem")[2]!;
    expect(row).not.toHaveAttribute("aria-describedby");
    expect(
      within(row).getByRole("button", {
        name: "Actions for Text section, not written yet",
      }),
    ).toHaveAccessibleDescription(problem);
    expect(
      within(row).getByRole("button", {
        name: /^Text section, not written yet/,
      }),
    ).toHaveAccessibleDescription(problem);
    expect(
      within(row).getByRole("button", {
        name: "Drag to reorder Text section, not written yet",
      }),
    ).toHaveAccessibleDescription(expect.stringContaining(problem));
  });

  it("marks an unwritten section once Publish is opened, even while it is open", async () => {
    renderBuilder();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a text section" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Fix the parts marked in the list.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Write something in this section. It is saved once it has text.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the preview as a picture: inert, with the issue's hero", () => {
    trpc.editing = twoArticles({
      issue: issue({ editorNote: null, coverImageUrl: null }),
    });
    renderBuilder();
    const preview = screen.getByTestId("issue-preview");
    const picture = preview.querySelector("[inert]");
    expect(picture).not.toBeNull();
    // Every article link of the preview sits inside the inert picture.
    const links = preview.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(picture!.contains(link)).toBe(true);
    expect(picture).toHaveTextContent("Summer");
    expect(picture).toHaveTextContent("A magazine by Night Owls");
  });

  it("opens the cover picker from its one visible, labelled button", () => {
    renderBuilder();
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(input).toHaveAttribute("aria-hidden", "true");
    const click = vi.spyOn(input, "click");
    const button = screen.getByRole("button", { name: "Cover Upload a cover" });
    expect(button).toHaveAccessibleDescription(
      "A tall image works best. Readers see it on the shelf and at the top of the issue.",
    );
    fireEvent.click(button);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("names where the back link goes", () => {
    renderBuilder();
    expect(
      screen.getByRole("link", { name: "Back to The Gazette" }),
    ).toHaveAttribute("href", "/communities/night-owls/magazine");
  });

  it("publishes with the latest version and then shows Published", async () => {
    trpc.publishIssue.mockResolvedValue(
      issue({ status: "published", updatedAt: T2 }),
    );
    renderBuilder();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "Only members of your community will be able to read it.",
      ),
    ).toBeVisible();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    });

    expect(trpc.publishIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
    });
    expect(
      within(screen.getByRole("dialog")).getByRole("link", {
        name: "Read the issue",
      }),
    ).toHaveAttribute("href", "/magazines/gazette/summer");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Published" })).toBeDisabled();
    // The address is fixed once published.
    expect(screen.getByLabelText("Address")).toHaveAttribute("readonly");
  });
  it("a publish refused with ISSUE_CHANGED enters the same conflict state as autosave", async () => {
    trpc.publishIssue.mockRejectedValue(refusal("ISSUE_CHANGED"));
    renderBuilder();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Publish",
        }),
      );
    });
    expect(trpc.publishIssue).toHaveBeenCalledTimes(1);

    // The dialog closes; the top bar's reload banner says why.
    expect(screen.queryByRole("dialog")).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This issue changed somewhere else");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    // Edits stay on screen but are not sent: the server would refuse them.
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Edited after the conflict" },
    });
    await settleSaves();
    expect(trpc.updateIssue).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Edited after the conflict",
    );

    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    });
    expect(trpc.refetch).toHaveBeenCalled();
  });

  it("is a named region inside the page's one main landmark, not a second main", () => {
    renderBuilder();
    expect(screen.queryByRole("main")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Put the issue together" }),
    ).toBeInTheDocument();
  });

  it("names the rich-text fields by their visible labels", async () => {
    renderBuilder();
    const note = screen.getByRole("textbox", { name: "Editor's note" });
    expect(note).toHaveAccessibleDescription(
      "A short welcome at the top of the issue. Leave it empty if you do not need one.",
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a text section" }));
    expect(screen.getByRole("textbox", { name: "Text" })).toBeInTheDocument();
  });

  it("keeps keyboard focus in the list when a row is removed", async () => {
    renderBuilder();
    await openRowMenu("First story");
    await pickMenuItem("Remove from issue");
    // The next row's menu button, not the page.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Actions for Second story" }),
    );

    await openRowMenu("Second story");
    await pickMenuItem("Remove from issue");
    // The list is empty now: focus lands on its empty text.
    expect(document.activeElement).toHaveTextContent(
      "This issue is empty. Add articles or a text section from Add more.",
    );
  });

  it("keeps keyboard focus in Add more when a ready article is added", async () => {
    trpc.candidates = [
      readyArticle(21, "Fresh piece"),
      readyArticle(22, "Late piece"),
    ];
    renderBuilder();
    fireEvent.click(
      screen.getByRole("button", { name: "Add Fresh piece to the issue" }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add Late piece to the issue" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add Late piece to the issue" }),
    );
    expect(document.activeElement).toHaveTextContent(
      "No articles are ready. Articles marked ready for an issue show up here.",
    );
  });

  it("adding the same article twice keeps one item", () => {
    trpc.candidates = [readyArticle(21, "Fresh piece")];
    renderBuilder();
    clickAddTwice("Add Fresh piece to the issue");
    const fresh = within(screen.getByRole("list", { name: "In this issue" }))
      .getAllByRole("listitem")
      .filter((row) => row.textContent?.includes("Fresh piece"));
    expect(fresh).toHaveLength(1);
  });

  it("every row opens the details panel and the preview shows the intro", () => {
    renderBuilder();
    const rows = within(
      screen.getByRole("list", { name: "In this issue" }),
    ).getAllByRole("listitem");
    expect(
      within(rows[0]!).getByRole("button", { name: /^First story/ }),
    ).toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole("button", { name: /^Second story/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(rows[0]!).getByRole("button", { name: /^First story/ }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Intro line (optional)" }),
      { target: { value: "Our take" } },
    );
    expect(screen.getByTestId("issue-preview")).toHaveTextContent("Our take");
  });

  it("offers to open an article in the article editor only when the viewer may edit it", async () => {
    trpc.editing = twoArticles({
      editableArticles: [{ id: 11, slug: "story-11" }],
    });
    trpc.candidates = [readyArticle(21, "Fresh piece", true)];
    renderBuilder();

    await openRowMenu("First story");
    expect(
      screen.getByRole("menuitem", { name: /Open the article/ }),
    ).toHaveAttribute(
      "href",
      "/communities/night-owls/magazine/articles/story-11/edit",
    );
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });

    await openRowMenu("Second story");
    expect(
      screen.queryByRole("menuitem", { name: /Open the article/ }),
    ).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });

    // A ready article the viewer wrote, added just now.
    fireEvent.click(
      screen.getByRole("button", { name: "Add Fresh piece to the issue" }),
    );
    await openRowMenu("Fresh piece");
    expect(
      screen.getByRole("menuitem", { name: /Open the article/ }),
    ).toHaveAttribute(
      "href",
      "/communities/night-owls/magazine/articles/story-21/edit",
    );
  });

  it("flags members-only events in the row and leaves them out of Visitor preview", () => {
    trpc.editing = twoArticles({
      issue: issue({ visibility: "public" }),
      items: [{ ...eventView(), itemId: "blk-event", membersOnly: true }],
      storedItems: [{ kind: "event", id: "blk-event", eventId: 7 }],
    });
    renderBuilder();
    expect(
      screen.getByText("Only members see this", { exact: false }),
    ).toBeVisible();
    const preview = screen.getByTestId("issue-preview");
    expect(
      within(preview).getByRole("link", { name: "Event 1", hidden: true }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    expect(within(preview).queryByText("Event 1")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Member" }));
    expect(within(preview).getByText("Event 1")).toBeInTheDocument();
  });

  it("previews and publishes for who can really read it after a community became unlisted", async () => {
    // Saved `public` while the community was listed: no confirmation.
    trpc.editing = twoArticles({
      issue: issue({ visibility: "public" }),
      communityIsPrivate: true,
      community: {
        name: "Night Owls",
        slug: "night-owls",
        isListedInDirectory: false,
      },
    });
    renderBuilder();
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    // Outsiders get a 404 for it now, so the preview shows them nothing.
    expect(screen.getByText("Visitors see nothing")).toBeVisible();

    // Once the editor confirms, it is public again: preview and dialog agree.
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand, show this outside the community",
      }),
    );
    expect(screen.queryByText("Visitors see nothing")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    expect(
      within(screen.getByRole("dialog")).getByText(
        /Anyone will be able to read it/,
      ),
    ).toBeVisible();
  });
});
