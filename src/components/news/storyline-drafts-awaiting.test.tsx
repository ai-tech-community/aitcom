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
    agentManagement: {
      listApprovalQueue: {
        useQuery: () => ({
          isPending: false,
          isError: false,
          data: [
            {
              id: DRAFT,
              type: "news_storyline",
              kind: "STORY",
              title: "Stored title",
              agentName: "Member bot",
              reviewPath: `/news/stories/drafts/${DRAFT}`,
            },
            {
              id: "5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
              type: "classroom_course_update",
              kind: "COURSE",
              title: "Mandarin from zero",
              agentName: "Nova",
              reviewPath:
                "/news/stories/drafts/5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
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
  expect(
    screen.getAllByRole("link", { name: "Review draft" })[0],
  ).toHaveAttribute("href", `/news/stories/drafts/${DRAFT}`);
  expect(screen.getByText("COURSE")).toBeInTheDocument();
  expect(screen.getByText("Mandarin from zero")).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: "Review draft" })[1],
  ).toHaveAttribute(
    "href",
    "/news/stories/drafts/5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
  );
});
