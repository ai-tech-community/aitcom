import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

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

const { setStatusMutate } = vi.hoisted(() => ({ setStatusMutate: vi.fn() }));

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
        useMutation: () => ({ mutate: setStatusMutate, isPending: false }),
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

function renderBoard(
  props: Partial<React.ComponentProps<typeof StartupsJobsBoard>> = {},
) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-09-23T12:00:00.000Z")}
      timeZone="UTC"
    >
      <StartupsJobsBoard
        locale="en"
        tracked={[
          {
            role: ROLE,
            status: "applying",
            trackedAt: "2026-09-21T12:00:00.000Z",
          },
        ]}
        communities={[{ slug: "ait", name: "AIT" }]}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function openMenu() {
  const trigger = screen.getByRole("button", {
    name: "Actions for Staff Engineer",
  });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("StartupsJobsBoard", () => {
  it("shows tracked roles by stage with an empty hint in empty columns", () => {
    const { container } = renderBoard();
    expect(screen.queryByRole("button", { name: "Track" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 3, name: "Applying" }),
    ).toBeInTheDocument();
    const applying = container.querySelector("[data-board-column=applying]");
    expect(applying?.textContent).toContain("Staff Engineer");
    expect(applying?.textContent).toContain("Toronto · Full-time");
    expect(applying?.textContent).toContain("Tracked 2 days ago");
    expect(
      container.querySelector("[data-board-column=applied]")?.textContent,
    ).toContain("No roles here yet.");
    expect(screen.getByRole("radio", { name: /Applying/ })).toBeChecked();
  });

  it("moves a card one step forward and saves the new stage", () => {
    const { container } = renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Move to Applied/ }));
    expect(
      container.querySelector("[data-board-column=applied]")?.textContent,
    ).toContain("Staff Engineer");
    expect(setStatusMutate).toHaveBeenCalledWith(
      { roleId: "role-1", status: "applied" },
      expect.anything(),
    );
  });

  it("offers no single next step at Offer", () => {
    renderBoard({
      tracked: [
        { role: ROLE, status: "offer", trackedAt: "2026-09-21T12:00:00.000Z" },
      ],
    });
    expect(screen.queryByRole("button", { name: /^Move to/ })).toBeNull();
  });

  it("previews the help post before posting and links it on the card", () => {
    renderBoard();
    expect(document.querySelector("[data-startup-help-sheet]")).toBeNull();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Ask for help" }));
    expect(document.querySelector("[data-startup-help-sheet]")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("What do you want help with?"), {
      target: { value: "A walkthrough of the system design section." },
    });
    fireEvent.change(screen.getByLabelText("Classroom"), {
      target: { value: "System design" },
    });
    const preview = document.querySelector("[data-startup-help-preview]");
    expect(preview?.textContent).toContain("A member");
    expect(preview?.textContent).toContain(
      "A walkthrough of the system design section.",
    );
    expect(preview?.textContent).toContain("System design");
    expect(preview?.textContent).not.toMatch(/fit score|salary/i);
    fireEvent.click(screen.getByRole("button", { name: "Post to community" }));

    const request = document.querySelector("[data-startup-help-request]");
    expect(request?.textContent).toContain("Asked in AIT");
    expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute(
      "href",
      "/communities/ait/forum/help-thread",
    );
  });

  it("teaches the next action when nothing is tracked", () => {
    renderBoard({ tracked: [] });
    expect(screen.getByText("Nothing tracked yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Open positions" }).length,
    ).toBeGreaterThan(0);
  });
});
