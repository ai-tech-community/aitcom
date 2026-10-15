import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { StorySuggestionBox } from "./story-suggestion-box";

const state = vi.hoisted(() => ({
  authStatus: "authenticated" as
    | "authenticated"
    | "guest"
    | "pending"
    | "unknown",
  mutate: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: state.authStatus,
    requireAuth: state.requireAuth,
  }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    news: {
      submitStorySuggestion: {
        useMutation: (options: {
          onSuccess: () => void;
          onError: (err: { message: string }) => void;
        }) => {
          state.mutate.mockImplementation(() => options.onSuccess());
          return { mutate: state.mutate, isPending: false };
        },
      },
    },
  },
}));

import { toast } from "sonner";

beforeEach(() => {
  vi.clearAllMocks();
  state.authStatus = "authenticated";
  state.requireAuth.mockImplementation((fn: () => void) => fn());
});

it("sends a story suggestion and toasts the stored confirmation", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorySuggestionBox />
    </NextIntlClientProvider>,
  );
  fireEvent.change(
    screen.getByLabelText(en.newsStories.contribute.suggestLabel),
    {
      target: { value: "https://example.com/source" },
    },
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: en.newsStories.contribute.suggestSubmit,
    }),
  );
  expect(state.mutate).toHaveBeenCalledWith({
    text: "https://example.com/source",
  });
  expect(toast.success).toHaveBeenCalledWith(
    en.newsStories.contribute.suggestSent,
  );
});

it("explains an unknown session and prevents sending", () => {
  state.authStatus = "unknown";
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorySuggestionBox />
    </NextIntlClientProvider>,
  );
  fireEvent.change(
    screen.getByLabelText(en.newsStories.contribute.suggestLabel),
    { target: { value: "A useful story idea" } },
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    en.newsStories.contribute.sessionFailed,
  );
  expect(
    screen.getByRole("button", {
      name: en.newsStories.contribute.suggestSubmit,
    }),
  ).toBeDisabled();
});

it("reserves room for the originating story in the text length", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorySuggestionBox story={{ title: "Local AI", slug: "local-ai" }} />
    </NextIntlClientProvider>,
  );
  expect(screen.getByRole("textbox")).toHaveAttribute(
    "maxlength",
    String(500 - "\n\nStory: /news/stories/local-ai".length),
  );
});
