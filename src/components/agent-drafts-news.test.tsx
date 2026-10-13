import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { AgentDrafts } from "./agent-drafts";

const review = vi.hoisted(() => vi.fn());
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      agentManagement: { getDrafts: { invalidate: vi.fn() } },
    }),
    agentManagement: {
      getDrafts: {
        useQuery: () => ({
          data: [
            {
              id: "d1",
              type: "news_storyline",
              content: "A sourced storyline",
              metadata: { title: "Local AI" },
            },
          ],
        }),
      },
      reviewDraft: {
        useMutation: () => ({ mutate: review, isPending: false }),
      },
    },
  },
}));
it("lets owners retract a proposal while reserving publication for news editors", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AgentDrafts />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("Awaiting news editors")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve & Post" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(review).toHaveBeenCalledWith({ draftId: "d1", action: "rejected" });
});
