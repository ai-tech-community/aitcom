import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { toast } from "sonner";
import { StorylineDraftQueue } from "./storyline-draft-queue";

const DRAFT = "f79b8204-0a7a-485a-82c9-a2a072034eab";
const approve = vi.hoisted(() => vi.fn());
const reject = vi.hoisted(() => vi.fn());
const approveOptions = vi.hoisted(() => ({
  current: null as null | {
    onSuccess: (saved: { id: string; slug: string }) => void;
  },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      news: {
        listStorylineDraftQueue: { invalidate: vi.fn() },
        listMyStorylineDrafts: { invalidate: vi.fn() },
        listAgentStorylineDrafts: { invalidate: vi.fn() },
      },
    }),
    news: {
      listStorylineDraftQueue: {
        useQuery: () => ({
          isPending: false,
          isError: false,
          data: [
            {
              id: DRAFT,
              title: "Stored title",
              overview: "Stored overview",
              agentName: "Member bot",
              reviewPath: `/news/stories/drafts/${DRAFT}`,
            },
          ],
        }),
      },
      approveAgentStorylineDraft: {
        useMutation: (opts: {
          onSuccess: (saved: { id: string; slug: string }) => void;
        }) => {
          approveOptions.current = opts;
          return { mutate: approve, isPending: false };
        },
      },
      dismissAgentStorylineDraft: {
        useMutation: () => ({ mutate: reject, isPending: false }),
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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

it("lists an existing pending draft and approves or rejects it", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorylineDraftQueue />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByRole("heading", { name: /drafts awaiting approval/i }),
  ).toBeInTheDocument();
  expect(screen.getByText("Stored title")).toBeInTheDocument();
  expect(screen.getByText(`Draft ${DRAFT}`)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Review draft" })).toHaveAttribute(
    "href",
    `/news/stories/drafts/${DRAFT}`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));
  expect(approve).toHaveBeenCalledWith({ draftId: DRAFT });
  approveOptions.current?.onSuccess({ id: "story-1", slug: "local-ai" });
  expect(toast.success).toHaveBeenCalledWith(
    "Approve and publish",
    expect.objectContaining({ description: expect.anything() }),
  );
  const description = (
    toast.success as unknown as {
      mock: { calls: Array<[string, { description: React.ReactNode }]> };
    }
  ).mock.calls[0]?.[1].description;
  render(<>{description}</>);
  expect(
    screen.getByRole("link", { name: "View the published story" }),
  ).toHaveAttribute("href", "/news/stories/local-ai");
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(reject).toHaveBeenCalledWith({ draftId: DRAFT });
});
