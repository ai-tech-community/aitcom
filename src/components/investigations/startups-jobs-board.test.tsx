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
  it("tracks a sourced role and posts a help note to one community", () => {
    render(
      <StartupsJobsBoard
        locale="en"
        roles={[ROLE]}
        communities={[{ slug: "ait", name: "AIT" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(
      screen.getByRole("heading", { name: "Applying" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask for help" }));
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
  });
});
