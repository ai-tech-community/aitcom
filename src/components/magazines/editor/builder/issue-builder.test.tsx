import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorItemView, ItemProblem } from "@/lib/magazines/item-views";
import type { MagazineIssue } from "@/payload-types";
import { localDateTimeToIso } from "@/lib/magazines/schedule";
import { newItemImage } from "@/lib/magazines/item-image";

import {
  automaticDraft,
  eventView,
  forumThreadView,
  launchpadProjectView,
} from "../../test-fixtures";
import { renderWithIntl } from "../../test-intl";

const T0 = "2026-10-20T10:00:00.000Z";
const T1 = "2026-10-20T10:00:05.000Z";
const T2 = "2026-10-20T10:00:09.000Z";
const originalTz = process.env.TZ;

type EditingData = {
  issue: MagazineIssue;
  autoDraft: ReturnType<typeof automaticDraft> | null;
  items: EditorItemView[];
  storedItems: unknown[];
  problems: ItemProblem[];
  magazine: { name: string; slug: string };
  communityIsPrivate: boolean;
  community: { name: string; slug: string; isListedInDirectory: boolean };
  openHrefs: Record<string, string>;
};

const trpc = vi.hoisted(() => ({
  editing: null as unknown,
  pending: false,
  refetch: vi.fn(),
  candidates: [] as unknown[],
  updateIssue: vi.fn(),
  setIssueItems: vi.fn(),
  publishIssue: vi.fn(),
  scheduleIssue: vi.fn(),
  unscheduleIssue: vi.fn(),
  invalidate: vi.fn(),
  removeItem: null as ((key: string) => void) | null,
  upload: vi.fn(),
}));
vi.mock("@/lib/upload-shared-image", () => ({
  uploadSharedImage: trpc.upload,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
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
          data: trpc.pending ? undefined : trpc.editing,
          dataUpdatedAt: 1,
          isLoading: false,
          isPending: trpc.pending,
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
      scheduleIssue: {
        useMutation: () => ({ mutateAsync: trpc.scheduleIssue }),
      },
      unscheduleIssue: {
        useMutation: () => ({ mutateAsync: trpc.unscheduleIssue }),
      },
      deleteDraftIssue: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("./items-list", async (importOriginal) => {
  const actual = await importOriginal<{
    ItemsList: typeof ItemsListComponent;
  }>();
  return {
    ...actual,
    ItemsList: (props: React.ComponentProps<typeof actual.ItemsList>) => {
      trpc.removeItem = props.onRemove;
      return <actual.ItemsList {...props} />;
    },
  };
});

import type { ItemsList as ItemsListComponent } from "./items-list";

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
      opening: `${title} opening`,
      readingMinutes: 3,
      imageUrl: null,
    },
  };
}

/** An issue with two saved articles. */
function twoArticles(overrides: Partial<EditingData> = {}): EditingData {
  return {
    issue: issue(),
    autoDraft: null,
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
    openHrefs: {},
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
  trpc.pending = false;
  trpc.upload.mockReset();
  trpc.editing = twoArticles();
  trpc.candidates = [];
  trpc.refetch.mockReset();
  trpc.invalidate.mockReset();
  trpc.updateIssue.mockReset();
  trpc.setIssueItems.mockReset();
  trpc.publishIssue.mockReset();
  trpc.scheduleIssue.mockReset();
  trpc.unscheduleIssue.mockReset();
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
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("IssueBuilder", () => {
  it("keeps an item's image controls locked when its uploader is reopened", async () => {
    let complete!: (url: string) => void;
    trpc.upload.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
    );
    const data = twoArticles();
    data.storedItems[0] = {
      ...(data.storedItems[0] as object),
      image: newItemImage("https://example.test/previous.jpg"),
    };
    trpc.editing = data;
    renderBuilder();
    const edit = within(
      within(screen.getByRole("list", { name: "In this issue" })).getAllByRole(
        "listitem",
      )[0]!,
    ).getByRole("button", { name: /^First story/ });
    fireEvent.click(edit);
    fireEvent.change(
      screen
        .getByRole("region", { name: "Article" })
        .querySelector('input[type="file"]')!,
      {
        target: {
          files: [new File(["image"], "first.png", { type: "image/png" })],
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(edit);
    const panel = screen.getByRole("region", { name: "Article" });
    expect(
      within(panel).getByRole("button", { name: /Uploading/ }),
    ).toBeDisabled();
    expect(
      within(panel).getByRole("button", { name: "Remove custom image" }),
    ).toBeDisabled();
    expect(within(panel).getByLabelText("Alt text")).toBeDisabled();
    fireEvent.change(panel.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "second.png", { type: "image/png" })],
      },
    });
    expect(trpc.upload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await act(async () => complete("https://example.test/completed.jpg"));
    await settleSaves();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });
  it("waits for an item image upload before publishing and autosaves the result", async () => {
    let complete!: (url: string) => void;
    trpc.upload.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
    );
    renderBuilder();
    const row = within(
      screen.getByRole("list", { name: "In this issue" }),
    ).getAllByRole("listitem")[0]!;
    fireEvent.click(within(row).getByRole("button", { name: /^First story/ }));
    const panel = screen.getByRole("region", { name: "Article" });
    fireEvent.change(panel.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "photo.png", { type: "image/png" })],
      },
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await settleSaves();
    expect(trpc.setIssueItems).not.toHaveBeenCalled();
    await act(async () => complete("https://example.test/uploaded.jpg"));
    await settleSaves();
    expect(trpc.setIssueItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "blk-1",
            image: expect.objectContaining({
              url: "https://example.test/uploaded.jpg",
              focalX: 50,
              focalY: 50,
            }),
          }),
          expect.anything(),
        ],
      }),
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });
  it("shows a skeleton while the issue query has not settled", () => {
    trpc.pending = true;
    renderBuilder();
    expect(screen.queryByText("This issue could not be loaded.")).toBeNull();
    expect(document.querySelector("[data-slot=skeleton]")).toBeTruthy();
  });

  it("previews a layout immediately and saves only its changed value", async () => {
    renderWithIntl(<IssueBuilder communitySlug="night-owls" issueId={5} />);
    const preview = screen.getByTestId("issue-preview");
    fireEvent.click(screen.getByRole("radio", { name: "Digest" }));
    expect(within(preview).getByRole("list", { hidden: true }).tagName).toBe(
      "OL",
    );
    expect(trpc.updateIssue).not.toHaveBeenCalled();
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledExactlyOnceWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
      layout: "digest",
    });
    fireEvent.click(screen.getByRole("radio", { name: "Long read" }));
    expect(within(preview).queryByRole("list", { hidden: true })).toBeNull();
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenLastCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T1,
      layout: "long-read",
    });
  });
  it("does not invent a fresh tick when returning to Everyone during a preview save", async () => {
    const savedPublic = issue({
      visibility: "public",
      publicConfirmedBy: "leader",
      publicConfirmedAt: T0,
    });
    trpc.editing = twoArticles({
      issue: savedPublic,
      communityIsPrivate: true,
      community: {
        name: "Night Owls",
        slug: "night-owls",
        isListedInDirectory: false,
      },
    });
    let finishPreview!: (saved: MagazineIssue) => void;
    trpc.updateIssue.mockImplementation(async (input: object) =>
      issue({ ...savedPublic, ...input, updatedAt: T2 }),
    );
    trpc.updateIssue.mockImplementationOnce(
      () =>
        new Promise<MagazineIssue>((resolve) => {
          finishPreview = resolve;
        }),
    );
    renderBuilder();
    fireEvent.click(
      screen.getByRole("radio", { name: "Preview for everyone" }),
    );
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("radio", { name: "Everyone" }));
    await act(async () =>
      finishPreview({ ...savedPublic, visibility: "teaser", updatedAt: T1 }),
    );
    await settleSaves();
    expect(trpc.updateIssue).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("checkbox", { name: /I understand/ }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it.each([true, false])(
    "sends a fresh confirmation when widening a saved preview, ticking before debounce: %s",
    async (tickBeforeDebounce) => {
      trpc.editing = twoArticles({
        issue: issue({
          visibility: "teaser",
          publicConfirmedBy: "leader",
          publicConfirmedAt: T0,
        }),
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
          publicConfirmedBy: "leader",
          publicConfirmedAt: T1,
          updatedAt: T1,
        }),
      );
      renderBuilder();
      fireEvent.click(screen.getByRole("radio", { name: "Everyone" }));
      expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
      if (!tickBeforeDebounce) {
        await settleSaves();
        expect(trpc.updateIssue).not.toHaveBeenCalled();
      }
      fireEvent.click(screen.getByRole("checkbox", { name: /I understand/ }));
      await settleSaves();
      expect(trpc.updateIssue).toHaveBeenCalledExactlyOnceWith({
        slug: "night-owls",
        issueId: 5,
        expectedUpdatedAt: T0,
        visibility: "public",
        confirmUnlistedPublic: true,
      });
      expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Summer special" },
      });
      await settleSaves();
      expect(trpc.updateIssue).toHaveBeenLastCalledWith({
        slug: "night-owls",
        issueId: 5,
        expectedUpdatedAt: T1,
        title: "Summer special",
      });
    },
  );

  it("does not autosave a confirmed preview just by opening the builder", async () => {
    trpc.editing = twoArticles({
      issue: issue({
        visibility: "teaser",
        publicConfirmedBy: "leader",
        publicConfirmedAt: T0,
      }),
      communityIsPrivate: true,
      community: {
        name: "Night Owls",
        slug: "night-owls",
        isListedInDirectory: false,
      },
    });
    renderBuilder();
    await settleSaves();
    expect(trpc.updateIssue).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox", { name: /I understand/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("shows reasons and the notice for an automatic draft", () => {
    trpc.editing = twoArticles({
      autoDraft: automaticDraft({
        "blk-1": { type: "waitingSince", at: "2026-10-24T10:00:00.000Z" },
        "blk-2": { type: "topic", topic: "agents" },
      }),
    });
    renderBuilder();
    expect(
      screen.getByRole("region", { name: "Draft details" }),
    ).toHaveTextContent("Check it, change what you like");
    expect(
      screen.getByRole("link", { name: "Change what gets picked" }),
    ).toHaveAttribute("href", "/communities/night-owls/magazine/auto-draft");
    expect(screen.getByTestId("issue-item-blk-1")).toHaveTextContent(
      "Picked because: Approved and waiting since 24 Oct 2026",
    );
    expect(screen.getByTestId("issue-item-blk-2")).toHaveTextContent(
      "Picked because: Matches your topic agents",
    );
    expect(
      screen.getByRole("region", { name: "Preview" }),
    ).not.toHaveTextContent("Picked because");
  });

  it.each([
    {
      status: "published" as const,
      scheduledVia: null,
      scheduledFor: null,
    },
    {
      status: "scheduled" as const,
      scheduledVia: "schedule" as const,
      scheduledFor: "2030-01-02T09:30:00.000Z",
    },
  ])(
    "keeps pick reasons without draft instructions for a $status automatic issue",
    (publication) => {
      trpc.editing = twoArticles({
        issue: issue(publication),
        autoDraft: automaticDraft({
          "blk-1": { type: "topic", topic: "agents" },
        }),
      });
      renderBuilder();
      expect(
        screen.queryByText(/publish it when you are happy/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Draft details" }),
      ).toHaveTextContent("Made automatically");
      expect(
        screen.queryByRole("button", { name: "Stop the automatic publish" }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("issue-item-blk-1")).toHaveTextContent(
        "Picked because: Matches your topic agents",
      );
    },
  );

  it.each(["details", "items"])(
    "says that a change stopped the automatic publish (%s)",
    async (part) => {
      trpc.editing = twoArticles({
        issue: issue({
          status: "scheduled",
          scheduledVia: "auto",
          scheduledFor: "2030-01-02T09:30:00.000Z",
        }),
        autoDraft: automaticDraft(),
      });
      trpc.updateIssue.mockResolvedValue(
        issue({
          title: "New title",
          status: "draft",
          scheduledVia: null,
          scheduledFor: null,
          updatedAt: T1,
        }),
      );
      renderBuilder();
      const message =
        "Your change stopped the automatic publish. Publish it yourself when it is ready.";
      expect(screen.queryByText(message)).toBeNull();
      if (part === "details")
        fireEvent.change(screen.getByLabelText("Title"), {
          target: { value: "New title" },
        });
      else act(() => trpc.removeItem!("blk-2"));
      await settleSaves();
      const announcement = screen.getByText(message);
      expect(announcement.closest('[role="status"]')).not.toBeNull();
      // Later save-status updates must not read this announcement again.
      expect(announcement.closest('[role="status"]')).toHaveAttribute(
        "aria-atomic",
        "false",
      );
      expect(screen.getAllByText(message)).toHaveLength(1);
      expect(
        screen.queryByRole("button", { name: "Stop the automatic publish" }),
      ).toBeNull();
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Another title" },
      });
      await settleSaves();
      expect(screen.getAllByText(message)).toHaveLength(1);
    },
  );

  it("shows nothing extra for an issue an editor made", async () => {
    renderBuilder();
    expect(screen.queryByRole("region", { name: "Draft details" })).toBeNull();
    expect(screen.queryByText(/Picked because/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New title" },
    });
    await settleSaves();
    expect(
      screen.queryByText(/Your change stopped the automatic publish/),
    ).toBeNull();
  });

  it("stops the automatic publish through the builder's version queue", async () => {
    trpc.editing = twoArticles({
      issue: issue({
        status: "scheduled",
        scheduledVia: "auto",
        scheduledFor: "2030-01-02T09:30:00.000Z",
      }),
      autoDraft: automaticDraft(),
    });
    let stopped!: (saved: MagazineIssue) => void;
    trpc.unscheduleIssue.mockImplementation(
      () =>
        new Promise<MagazineIssue>((resolve) => {
          stopped = resolve;
        }),
    );
    renderBuilder();
    screen.getByRole("button", { name: "Stop the automatic publish" }).focus();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Stop the automatic publish" }),
      );
    });
    expect(
      screen.getByRole("button", { name: "Stop the automatic publish" }),
    ).toBeDisabled();
    expect(trpc.unscheduleIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T0,
    });
    await act(async () => {
      stopped(
        issue({
          status: "draft",
          scheduledVia: null,
          scheduledFor: null,
          updatedAt: T1,
        }),
      );
    });
    expect(
      screen.queryByRole("button", { name: "Stop the automatic publish" }),
    ).toBeNull();
    expect(
      screen.queryByText(/Your change stopped the automatic publish/),
    ).toBeNull();
    expect(
      screen
        .getByText("The issue is a draft again.")
        .closest('[role="status"]'),
    ).not.toBeNull();
    expect(screen.getByRole("region", { name: "Draft details" })).toHaveFocus();
  });

  it("shows a refusal when stopping the automatic publish fails", async () => {
    trpc.editing = twoArticles({
      issue: issue({
        status: "scheduled",
        scheduledVia: "auto",
        scheduledFor: "2030-01-02T09:30:00.000Z",
      }),
      autoDraft: automaticDraft(),
    });
    trpc.unscheduleIssue.mockRejectedValue(refusal("NO_RIGHTS"));
    renderBuilder();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Stop the automatic publish" }),
      );
    });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Stop the automatic publish" }),
    ).toBeEnabled();
  });

  it("does not cancel again when flushing a change already stopped the automatic publish", async () => {
    trpc.editing = twoArticles({
      issue: issue({
        status: "scheduled",
        scheduledVia: "auto",
        scheduledFor: "2030-01-02T09:30:00.000Z",
      }),
      autoDraft: automaticDraft(),
    });
    trpc.updateIssue.mockResolvedValue(
      issue({
        title: "New title",
        status: "draft",
        scheduledVia: null,
        scheduledFor: null,
        updatedAt: T1,
      }),
    );
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New title" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Stop the automatic publish" }),
      );
    });
    expect(trpc.updateIssue).toHaveBeenCalled();
    expect(trpc.unscheduleIssue).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Stop the automatic publish" }),
    ).toBeNull();
  });

  it("schedules with the builder's version and shows the time in the top bar", async () => {
    process.env.TZ = "America/Los_Angeles";
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const publishAt = localDateTimeToIso("2030-01-02T09:30")!;
    trpc.scheduleIssue.mockResolvedValue(
      issue({ status: "scheduled", scheduledFor: publishAt, updatedAt: T2 }),
    );
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "A new title" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(
      dialog.getByRole("radio", { name: "Later, at a time I choose" }),
    );
    fireEvent.change(dialog.getByLabelText("Date and time"), {
      target: { value: "2030-01-02T09:30" },
    });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Schedule it" }));
    });
    expect(trpc.updateIssue).toHaveBeenCalled(); // Scheduling flushed the pending title.
    expect(trpc.scheduleIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T1,
      publishAt,
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    const bar = within(
      screen
        .getByRole("link", { name: "Back to The Gazette" })
        .closest("header")!,
    );
    const goesOut = bar.getByText(/^Goes out\b/);
    expect(goesOut).toHaveTextContent("9:30 AM");
    expect(goesOut).not.toHaveClass("font-mono");
    expect(within(goesOut).getByText(/9:30 AM/)).toHaveClass("font-mono");
    expect(bar.getByText(/Issue 2 · Scheduled/)).toBeVisible();
    expect(bar.getByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.getByLabelText("Address")).not.toHaveAttribute("readonly");
  });

  it("a schedule conflict shows the reload banner", async () => {
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    trpc.scheduleIssue.mockRejectedValue(refusal("ISSUE_CHANGED"));
    renderBuilder();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    fireEvent.click(
      screen.getByRole("radio", { name: "Later, at a time I choose" }),
    );
    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value: "2030-01-02T09:30" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Schedule it" }));
    });
    expect(trpc.scheduleIssue).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This issue changed somewhere else",
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("cancels with the builder's version after saving pending edits", async () => {
    const scheduled = issue({
      status: "scheduled",
      scheduledFor: "2030-01-02T09:30:00.000Z",
    });
    trpc.editing = twoArticles({ issue: scheduled });
    trpc.updateIssue.mockResolvedValue({ ...scheduled, updatedAt: T1 });
    trpc.unscheduleIssue.mockResolvedValue(
      issue({ scheduledFor: null, updatedAt: T2 }),
    );
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Revised title" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Cancel the schedule" }),
      );
    });
    expect(trpc.unscheduleIssue).toHaveBeenCalledWith({
      slug: "night-owls",
      issueId: 5,
      expectedUpdatedAt: T1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText(/^Goes out\b/)).toBeNull();
    expect(screen.getByText(/Issue 2 · Draft/)).toBeVisible();
  });

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

  it.each(["public", "teaser"] as const)(
    "blocks Publish for unconfirmed %s in a private community until the box is checked",
    async (visibility) => {
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

      fireEvent.click(
        screen.getByRole("radio", {
          name: visibility === "teaser" ? "Preview for everyone" : "Everyone",
        }),
      );
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
        visibility,
        confirmUnlistedPublic: true,
      });
    },
  );

  it.each(["public", "teaser"] as const)(
    "records the opt-in for an issue already %s but unconfirmed in a private community",
    async (visibility) => {
      // Saved `public` before the community became unlisted: no confirmation.
      trpc.editing = twoArticles({
        issue: issue({ visibility }),
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
        visibility,
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
    },
  );

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
      screen.getByRole("textbox", { name: "Heading (optional)" }),
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
      "This issue is empty. Add something from Add more.",
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

  it("does not resurrect a removed row when another candidate is added in the same tick", async () => {
    trpc.candidates = [readyArticle(21, "Fresh piece")];
    renderBuilder();
    const add = screen.getByRole("button", {
      name: "Add Fresh piece to the issue",
    });
    act(() => {
      trpc.removeItem!("blk-1");
      add.click();
    });
    const list = screen.getByRole("list", { name: "In this issue" });
    expect(within(list).queryByText("First story")).toBeNull();
    expect(within(list).getByText("Second story")).toBeInTheDocument();
    expect(within(list).getByText("Fresh piece")).toBeInTheDocument();
  });

  it("returns focus to the row edit button when details are Done", () => {
    renderBuilder();
    const row = within(
      screen.getByRole("list", { name: "In this issue" }),
    ).getAllByRole("listitem")[0]!;
    const edit = within(row).getByRole("button", { name: /^First story/ });
    fireEvent.click(edit);
    screen.getByRole("textbox", { name: "Intro line (optional)" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.queryByRole("textbox", { name: "Intro line (optional)" }),
    ).toBeNull();
    expect(document.activeElement).toBe(edit);
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
      openHrefs: {
        "article:11": "/communities/night-owls/magazine/articles/story-11/edit",
      },
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

  it("counts saved markers for the publish notice without blocking Publish", () => {
    trpc.editing = twoArticles({
      items: [
        {
          kind: "storyline",
          itemId: "gone-story",
          unavailable: true,
          reason: "unpublished",
        },
        { ...eventView(), itemId: "private-event", membersOnly: true },
        {
          kind: "forumThread",
          itemId: "gone-thread",
          unavailable: true,
          reason: "missing",
        },
      ],
      storedItems: [
        { kind: "storyline", id: "gone-story", storylineId: "s1" },
        { kind: "event", id: "private-event", eventId: 7 },
        { kind: "forumThread", id: "gone-thread", threadId: 8 },
      ],
    });
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "2 items are no longer available. Readers will not see them.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Publish" }),
    ).toBeEnabled();
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

  it("flags members-only forum threads in the row and leaves them out of Visitor preview", () => {
    trpc.editing = twoArticles({
      issue: issue({ visibility: "public" }),
      items: [
        { ...forumThreadView(), itemId: "blk-thread", membersOnly: true },
      ],
      storedItems: [{ kind: "forumThread", id: "blk-thread", threadId: 7 }],
    });
    renderBuilder();
    expect(
      screen.getByText("Only members see this", { exact: false }),
    ).toBeVisible();
    const preview = screen.getByTestId("issue-preview");
    expect(
      within(preview).getByRole("link", { name: "Thread 1", hidden: true }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    expect(within(preview).queryByText("Thread 1")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Member" }));
    expect(within(preview).getByText("Thread 1")).toBeInTheDocument();
  });

  it("flags members-only projects in the row and leaves them out of Visitor preview", () => {
    trpc.editing = twoArticles({
      issue: issue({ visibility: "public" }),
      items: [
        { ...launchpadProjectView(), itemId: "blk-project", membersOnly: true },
      ],
      storedItems: [
        { kind: "launchpadProject", id: "blk-project", projectId: 7 },
      ],
    });
    renderBuilder();
    expect(
      screen.getByText("Only members see this", { exact: false }),
    ).toBeVisible();
    const preview = screen.getByTestId("issue-preview");
    expect(
      within(preview).getByRole("link", { name: "Project 1", hidden: true }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    expect(within(preview).queryByText("Project 1")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Member" }));
    expect(within(preview).getByText("Project 1")).toBeInTheDocument();
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
