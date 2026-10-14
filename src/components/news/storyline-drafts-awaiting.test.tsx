import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { StorylineDraftsAwaiting } from "./storyline-drafts-awaiting";

const DRAFT = "f79b8204-0a7a-485a-82c9-a2a072034eab";
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    news: {
      listMyStorylineDrafts: {
        useQuery: () => ({
          isPending: false,
          isError: false,
          data: [
            {
              id: DRAFT,
              title: "Stored title",
              agentName: "Member bot",
              reviewPath: `/news/stories/drafts/${DRAFT}`,
            },
          ],
        }),
      },
    },
  },
}));

it("shows the owner the drafts that are waiting, including an existing row", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorylineDraftsAwaiting />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByRole("heading", { name: /drafts awaiting approval/i }),
  ).toBeInTheDocument();
  expect(screen.getByText(`Draft ${DRAFT}`)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Review draft" })).toHaveAttribute(
    "href",
    `/news/stories/drafts/${DRAFT}`,
  );
});
