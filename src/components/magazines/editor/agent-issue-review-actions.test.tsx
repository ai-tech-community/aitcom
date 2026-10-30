import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { AgentIssueReviewActions } from "./agent-issue-review-actions";

const approve = vi.hoisted(() => vi.fn());
const reject = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    magazineAgentReview: {
      approve: {
        useMutation: () => ({ mutate: approve, isPending: false }),
      },
      reject: {
        useMutation: () => ({ mutate: reject, isPending: false }),
      },
    },
  },
}));

function renderActions(canApprove: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AgentIssueReviewActions draftId="draft-1" canApprove={canApprove} />
    </NextIntlClientProvider>,
  );
}

it("approves through the human review action and does not offer a separate publish", () => {
  renderActions(true);
  expect(
    screen.queryByRole("button", { name: "Publish" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));
  expect(approve).toHaveBeenCalledWith({ draftId: "draft-1" });
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(reject).toHaveBeenCalledWith({ draftId: "draft-1" });
});

it("hides approval when the issue is not waiting for a person", () => {
  renderActions(false);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
