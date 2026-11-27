import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/magazines/test-intl";
import { NewsSourcesSettings } from "./news-sources-settings";

const hooks = vi.hoisted(() => ({
  preview: vi.fn(),
  select: vi.fn(),
  remove: vi.fn(),
  add: vi.fn(),
  previewState: vi.fn(),
}));
vi.mock("@/trpc/react", () => {
  const action = (mutate: typeof hooks.select) => ({
    useMutation: () => ({ mutate, reset: vi.fn() }),
  });
  return {
    api: {
      useUtils: () => ({}),
      news: {
        sources: {
          list: {
            useQuery: () => ({
              data: [
                {
                  id: "first",
                  name: "Town News",
                  url: "https://town.example/feed",
                  selected: null,
                },
                {
                  id: "local",
                  name: "Local",
                  url: "https://local.example/feed",
                  selected: "local",
                },
              ],
            }),
          },
          preview: {
            useMutation: () => ({
              mutate: hooks.preview,
              reset: vi.fn(),
              ...hooks.previewState(),
            }),
          },
          select: action(hooks.select),
          remove: action(hooks.remove),
          add: action(hooks.add),
        },
      },
    },
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  hooks.previewState.mockReturnValue({});
});
it("searches, selects and removes a community source", () => {
  renderWithIntl(<NewsSourcesSettings slug="town" />);
  fireEvent.change(screen.getByLabelText("Search existing sources"), {
    target: { value: "missing" },
  });
  expect(screen.queryByRole("button", { name: "Add Town News" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Search existing sources"), {
    target: { value: "town.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Town News" }));
  expect(hooks.select).toHaveBeenCalledWith({ slug: "town", feedId: "first" });
  fireEvent.click(screen.getByRole("button", { name: "Remove Local" }));
  expect(hooks.remove).toHaveBeenCalledWith({ slug: "town", feedId: "local" });
});
it("previews a website then confirms its resolved feed", () => {
  const { rerender } = renderWithIntl(<NewsSourcesSettings slug="town" />);
  fireEvent.change(screen.getByLabelText("Website or RSS/Atom feed URL"), {
    target: { value: "https://new.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview source" }));
  expect(hooks.preview).toHaveBeenCalledWith({
    slug: "town",
    url: "https://new.example",
  });
  const url = "https://new.example/rss";
  hooks.previewState.mockReturnValue({
    data: { kind: "feed", url, name: "New", headline: "Local headline" },
  });
  rerender(<NewsSourcesSettings slug="town" />);
  expect(screen.getByText("Local headline")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Add to community and shared sources" }),
  );
  expect(hooks.add).toHaveBeenCalledWith({ slug: "town", url });
});
it("offers direct feed entry when discovery fails", () => {
  hooks.previewState.mockReturnValue({ isError: true });
  renderWithIntl(<NewsSourcesSettings slug="town" />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a direct RSS or Atom URL",
  );
});
