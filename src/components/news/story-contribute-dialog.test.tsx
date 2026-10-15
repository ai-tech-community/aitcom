import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { StoryContributeDialog } from "./story-contribute-dialog";

const state = vi.hoisted(() => ({
  signedIn: true,
  requireAuth: vi.fn(),
  mutate: vi.fn(),
  callbacks: null as null | {
    onSuccess: () => void;
    onError: (error: { message: string }) => void;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: state.signedIn ? "authenticated" : "guest",
    requireAuth: state.requireAuth,
  }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    news: {
      submitStorySuggestion: {
        useMutation: (callbacks: NonNullable<typeof state.callbacks>) => {
          state.callbacks = callbacks;
          return { mutate: state.mutate, isPending: false };
        },
      },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.signedIn = true;
  state.requireAuth.mockImplementation((action: () => void) => {
    if (state.signedIn) action();
  });
});
function show(locale = "en", story?: { slug: string; title: string }) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "nl" ? nl : en}
      timeZone="UTC"
    >
      <StoryContributeDialog story={story} />
    </NextIntlClientProvider>,
  );
  const t =
    locale === "nl" ? nl.newsStories.contribute : en.newsStories.contribute;
  const trigger = screen.getByRole("button", { name: t.entry });
  fireEvent.click(trigger);
  return { t, trigger };
}
it("sends the current story as context, shows confirmation, and closes with focus restored", async () => {
  const { t, trigger } = show("en", { title: "Local AI", slug: "local-ai" });
  expect(screen.getByRole("dialog", { name: t.dialogTitle })).toHaveTextContent(
    "For this story: Local AI",
  );
  const field = screen.getByRole("textbox", { name: t.suggestLabel });
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: "https://example.com/source" } });
  fireEvent.click(screen.getByRole("button", { name: t.suggestSubmit }));
  expect(state.mutate).toHaveBeenCalledWith({
    text: "https://example.com/source",
    storySlug: "local-ai",
  });
  act(() => state.callbacks!.onSuccess());
  expect(screen.getByRole("status")).toHaveTextContent(t.suggestSent);
  fireEvent.click(screen.getByRole("button", { name: t.close }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
});
it("preserves the suggestion on failure and allows a retry", () => {
  const { t } = show();
  const field = screen.getByRole("textbox", { name: t.suggestLabel });
  fireEvent.change(field, { target: { value: "A story about local models" } });
  fireEvent.click(screen.getByRole("button", { name: t.suggestSubmit }));
  act(() => state.callbacks!.onError({ message: "unavailable" }));
  expect(field).toHaveValue("A story about local models");
  expect(screen.getByRole("status")).toHaveTextContent(t.suggestFailed);
  fireEvent.click(screen.getByRole("button", { name: t.suggestSubmit }));
  expect(state.mutate).toHaveBeenCalledTimes(2);
});
it("asks guests to sign in and offers the secondary agent path in Dutch", async () => {
  state.signedIn = false;
  const { t, trigger } = show("nl");
  expect(screen.getByRole("link", { name: t.agentPath })).toHaveAttribute(
    "href",
    "/news/stories/contribute#agent-research",
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t.suggestSignIn }));
  expect(state.requireAuth).toHaveBeenCalledWith(
    expect.any(Function),
    t.suggestSignIn,
  );
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
});
