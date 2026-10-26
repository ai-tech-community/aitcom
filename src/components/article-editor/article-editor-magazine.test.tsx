// The article editor writing for a community magazine (spec 2026-10-26,
// Task 15): the draft is created for the magazine, the action is "Mark
// ready for an issue", and a ready article returns to the Magazine tab.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/magazines/test-intl";

const calls = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  submit: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    articles: {
      create: { useMutation: () => ({ mutateAsync: calls.create }) },
      update: { useMutation: () => ({ mutateAsync: calls.update }) },
      submit: { useMutation: () => ({ mutateAsync: calls.submit }) },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: calls.push }),
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

const destination: ArticleDestination = {
  kind: "magazine",
  magazineId: 42,
  magazineName: "The Gazette",
  communitySlug: "night-owls",
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

describe("ArticleEditor writing for a magazine", () => {
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
