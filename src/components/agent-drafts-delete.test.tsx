import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import { AgentDrafts } from "./agent-drafts";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

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
              id: "del-1",
              type: "delete",
              content: "Issue 7",
              metadata: {
                title: "Issue 7",
                destinationLabel: "Delete issue: Issue 7",
                destinationPath: "/communities/town/magazine",
              },
            },
          ],
          isLoading: false,
          isError: false,
        }),
      },
      reviewDraft: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

it("asks the owner to approve a delete instead of posting it", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AgentDrafts />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("WILL DELETE")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Approve delete" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve & Post" }),
  ).not.toBeInTheDocument();
});
