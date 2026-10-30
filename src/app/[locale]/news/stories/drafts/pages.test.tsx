import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  staff: false,
  session: null as { user: { id: string; email: string } } | null,
  draft: null as {
    id: string;
    ownerId: string;
    title: string;
    overview: string;
    agentName: string;
    status: string;
  } | null,
  review: null as {
    id: string;
    type: string;
    kind: string;
    title: string;
    body: string;
    agentName: string;
    destinationLabel: string | null;
    destinationPath: string | null;
    publishesOnThisPage: boolean;
  } | null,
}));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespace as never,
    }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    redirect(url);
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
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
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => state.session,
}));
vi.mock("@/server/news/staff", () => ({
  isNewsStaff: async () => state.staff,
}));
vi.mock("@/server/news/storyline-drafts", () => ({
  readStorylineDraft: async () => state.draft,
}));
vi.mock("@/components/news/storyline-drafts-awaiting", () => ({
  StorylineDraftsAwaiting: () => <div>Draft queue</div>,
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/agent/approval-queue", () => ({
  loadDraftReview: async () => state.review,
}));
vi.mock("@/components/news/agent-draft-review", () => ({
  AgentDraftReview: ({ draft }: { draft: { title: string; kind: string } }) => (
    <div>
      <p>{draft.kind}</p>
      <button type="button">Approve and publish</button>
      <button type="button">Reject</button>
    </div>
  ),
}));
vi.mock("@/components/news/storyline-draft-review-actions", () => ({
  StorylineDraftReviewActions: ({ canApprove }: { canApprove: boolean }) => (
    <div>
      {canApprove ? <button type="button">Approve and publish</button> : null}
      <button type="button">Reject</button>
    </div>
  ),
}));
import QueuePage, { metadata as queueMetadata } from "./page";
import ReviewPage, { metadata as reviewMetadata } from "./[draftId]/page";

const DRAFT = "f79b8204-0a7a-485a-82c9-a2a072034eab";

beforeEach(() => {
  state.staff = false;
  state.session = null;
  state.draft = null;
  state.review = null;
  redirect.mockClear();
});

const show = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );

it("keeps the queue and the review page out of search indexes", () => {
  expect(queueMetadata.robots).toEqual({ index: false, follow: false });
  expect(reviewMetadata.robots).toEqual({ index: false, follow: false });
});

it("sends anonymous editors to sign in and shows the queue to signed-in members", async () => {
  await expect(QueuePage()).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledWith(
    "/en/auth/signin?redirect=/en/news/stories/drafts",
  );
  state.session = { user: { id: "member", email: "member@example.org" } };
  show(await QueuePage());
  expect(screen.getByText("Draft queue")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Drafts awaiting approval" }),
  ).toBeInTheDocument();
});

it("shows an existing draft to its owner and to an editor, and hides it from other members", async () => {
  state.draft = {
    id: DRAFT,
    ownerId: "owner",
    title: "Stored title",
    overview: "Stored overview",
    agentName: "Member bot",
    status: "pending",
  };
  await expect(
    ReviewPage({ params: Promise.resolve({ draftId: DRAFT }) }),
  ).rejects.toThrow("NEXT_REDIRECT");
  state.session = { user: { id: "stranger", email: "stranger@example.org" } };
  await expect(
    ReviewPage({ params: Promise.resolve({ draftId: DRAFT }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  state.session = { user: { id: "owner", email: "owner@example.org" } };
  show(await ReviewPage({ params: Promise.resolve({ draftId: DRAFT }) }));
  expect(
    screen.getByRole("heading", { name: "Stored title" }),
  ).toBeInTheDocument();
  expect(screen.getByText(`Draft ${DRAFT}`)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Approve and publish" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  expect(
    screen.getByText("Approve and publish puts this story on Ongoing stories."),
  ).toBeInTheDocument();
  state.staff = true;
  state.session = { user: { id: "editor", email: "editor@example.org" } };
  show(await ReviewPage({ params: Promise.resolve({ draftId: DRAFT }) }));
  expect(
    screen.getAllByRole("button", { name: "Approve and publish" }).length,
  ).toBeGreaterThan(0);
});

it("reviews a course draft on its own page", async () => {
  state.session = { user: { id: "owner", email: "owner@example.org" } };
  state.review = {
    id: "5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
    type: "classroom_course_update",
    kind: "COURSE",
    title: "Mandarin from zero",
    body: "Publish the course",
    agentName: "Nova",
    destinationLabel: "Mandarin from zero",
    destinationPath:
      "/communities/chinese-together/classroom/mandarin-from-zero",
    publishesOnThisPage: true,
  };
  show(
    await ReviewPage({
      params: Promise.resolve({
        draftId: "5b9cd5da-f7c0-4977-b68f-f1cb18a6d1cb",
      }),
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Mandarin from zero" }),
  ).toBeInTheDocument();
  expect(screen.getByText("COURSE")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Approve and publish" }),
  ).toBeInTheDocument();
});
