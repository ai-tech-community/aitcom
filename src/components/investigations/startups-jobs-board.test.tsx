import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StartupsJobsBoard } from "./startups-jobs-board";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      startups: {
        getMyRoleApplication: { invalidate: vi.fn() },
      },
    }),
    startups: {
      setMyRoleApplication: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      setMyTrackedRoleStatus: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      askMyTrackedRoleHelp: {
        useMutation: (options?: {
          onSuccess?: (data: {
            roleId: string;
            communitySlug: string;
            communityName: string;
            note: string;
            classroom: string;
            path: string;
          }) => void;
        }) => ({
          mutate: (input: {
            roleId: string;
            communitySlug: string;
            note: string;
            classroom?: string;
          }) => {
            options?.onSuccess?.({
              roleId: input.roleId,
              communitySlug: input.communitySlug,
              communityName: "AIT",
              note: input.note,
              classroom: input.classroom ?? "",
              path: `/communities/${input.communitySlug}/forum/help-thread`,
            });
          },
          isPending: false,
        }),
      },
    },
  },
}));

const ROLE: StartupRolePublic = {
  id: "role-1",
  startupId: "startup-1",
  startupSlug: "fixture-co",
  startupName: "Fixture Co",
  startupLogoUrl: null,
  slug: "fixture-co-staff-engineer",
  title: "Staff Engineer",
  location: "Toronto",
  workType: "Full-time",
  sourceUrl: "https://fixture.example/careers/staff",
  applyUrl: null,
  descriptionText: null,
  fetchedAt: "2026-09-22T00:00:00.000Z",
  board: "html",
  status: "open",
};

describe("StartupsJobsBoard", () => {
  it("shows only tracked roles and posts a help note from a sheet", () => {
    render(
      <StartupsJobsBoard
        locale="en"
        tracked={[{ role: ROLE, status: "applying" }]}
        communities={[{ slug: "ait", name: "AIT" }]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Track" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Applying" }),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-startup-help-sheet]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask for help" }));
    expect(document.querySelector("[data-startup-help-sheet]")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("What do you want help with?"), {
      target: { value: "A walkthrough of the system design section." },
    });
    fireEvent.change(screen.getByLabelText("Classroom"), {
      target: { value: "System design" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post to community" }));

    const request = document.querySelector("[data-startup-help-request]");
    expect(request?.textContent).toContain("Staff Engineer");
    expect(request?.textContent).toContain(
      "A walkthrough of the system design section.",
    );
    expect(request?.textContent).toContain("System design");
    expect(request?.textContent).not.toMatch(/fit score|salary/i);
    expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute(
      "href",
      "/communities/ait/forum/help-thread",
    );
  });
});
