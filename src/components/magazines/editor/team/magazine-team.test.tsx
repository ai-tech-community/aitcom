import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useState } from "react";

import type { MagazineRole } from "@/lib/magazines/roles";
import type {
  StaffCandidate,
  StaffMember,
} from "@/server/magazines/staff-service";

import { renderWithIntl } from "../../test-intl";

type Assignment = { slug: string; userId: string; role: MagazineRole };
type AssignOptions = {
  onSuccess: (person: StaffMember, input: Assignment) => void;
  onError: (error: unknown) => void;
};
type RemoveOptions = {
  onSuccess: (
    data: { ok: true },
    input: { slug: string; userId: string },
  ) => void;
  onError: (error: unknown) => void;
};

const trpc = vi.hoisted(() => ({
  staff: [] as StaffMember[],
  candidates: [] as StaffCandidate[],
  assign: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  invalidateSearch: vi.fn(),
  search: vi.fn(),
  retryStaff: vi.fn(),
  retrySearch: vi.fn(),
  failure: null as string | null,
  loading: false,
  error: false,
  searchLoading: false,
  searchError: false,
  pending: false,
  defer: false,
  finishAssign: null as (() => void) | null,
  push: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: trpc.push }),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      magazines: {
        listStaff: { invalidate: trpc.invalidate },
        searchStaffCandidates: { invalidate: trpc.invalidateSearch },
      },
    }),
    magazines: {
      listStaff: {
        useQuery: () => ({
          data: trpc.loading ? undefined : trpc.staff,
          isLoading: trpc.loading,
          isError: trpc.error,
          refetch: trpc.retryStaff,
        }),
      },
      searchStaffCandidates: {
        useQuery: (
          input: { slug: string; query: string },
          opts: { enabled: boolean },
        ) => {
          if (opts.enabled) trpc.search(input);
          return {
            data:
              opts.enabled && !trpc.searchLoading ? trpc.candidates : undefined,
            isLoading: opts.enabled && trpc.searchLoading,
            isFetching: opts.enabled && trpc.searchLoading,
            isError: opts.enabled && trpc.searchError,
            refetch: trpc.retrySearch,
          };
        },
      },
      assignStaffRole: {
        useMutation: (opts: AssignOptions) => {
          const [pending, setPending] = useState(false);
          return {
            isPending: trpc.pending || pending,
            mutate: (input: Assignment) => {
              trpc.assign(input);
              if (trpc.defer) {
                setPending(true);
                const person = [...trpc.staff, ...trpc.candidates].find(
                  (p) => p.userId === input.userId,
                )!;
                trpc.finishAssign = () => {
                  setPending(false);
                  opts.onSuccess(
                    {
                      ...person,
                      role: input.role,
                      source: "assigned",
                      isActiveMember: true,
                      isViewer:
                        "isViewer" in person && person.isViewer === true,
                    },
                    input,
                  );
                };
                return;
              }
              if (trpc.failure) opts.onError({ message: trpc.failure });
              else {
                const person = [...trpc.staff, ...trpc.candidates].find(
                  (p) => p.userId === input.userId,
                )!;
                opts.onSuccess(
                  {
                    ...person,
                    role: input.role,
                    source: "assigned",
                    isActiveMember: true,
                    isViewer: "isViewer" in person && person.isViewer === true,
                  },
                  input,
                );
              }
            },
          };
        },
      },
      removeStaffRole: {
        useMutation: (opts: RemoveOptions) => ({
          isPending: trpc.pending,
          mutate: (input: { slug: string; userId: string }) => {
            trpc.remove(input);
            if (trpc.failure) opts.onError({ message: trpc.failure });
            else opts.onSuccess({ ok: true }, input);
          },
        }),
      },
    },
  },
}));

import { MagazineTeam } from "./magazine-team";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Radix scrolls a selected option into view; jsdom has no layout engine.
  HTMLElement.prototype.scrollIntoView = vi.fn();
  trpc.staff = [
    {
      userId: "owner",
      name: "Olivia",
      image: null,
      role: "editor_in_chief",
      source: "owner",
      isActiveMember: true,
      isViewer: false,
    },
    {
      userId: "admin",
      name: "Alex",
      image: null,
      role: "editor_in_chief",
      source: "admin",
      isActiveMember: true,
      isViewer: false,
    },
    {
      userId: "editor",
      name: "Eden",
      image: null,
      role: "editor",
      source: "assigned",
      isActiveMember: true,
      isViewer: false,
    },
    {
      userId: "former",
      name: "Fran",
      image: null,
      role: "contributor",
      source: "assigned",
      isActiveMember: false,
      isViewer: false,
    },
  ];
  trpc.candidates = [
    { userId: "ada", name: "Ada", image: null },
    { userId: "grace", name: "Grace", image: null },
  ];
  trpc.failure = null;
  trpc.loading = false;
  trpc.error = false;
  trpc.searchLoading = false;
  trpc.searchError = false;
  trpc.pending = false;
  trpc.defer = false;
  trpc.finishAssign = null;
});
afterEach(() => vi.useRealTimers());

async function search(value = "a") {
  fireEvent.change(screen.getByRole("textbox", { name: "Find a member" }), {
    target: { value },
  });
  await act(() => vi.advanceTimersByTimeAsync(250));
}

function chooseRole(control: HTMLElement, name: string) {
  fireEvent.keyDown(control, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${name}`) }));
}

describe("MagazineTeam", () => {
  it("labels each row's controls with the person's name", () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    expect(
      screen.getByRole("combobox", { name: "Eden Job on the team" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Eden" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Fran" })).toBeVisible();
  });

  it("confirms losing your own management access before changing your job, then redirects", async () => {
    trpc.staff[2] = {
      ...trpc.staff[2]!,
      role: "editor_in_chief",
      isViewer: true,
    };
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const row = screen.getByRole("listitem", { name: "Eden" });
    expect(within(row).getByText("You")).toBeVisible();
    const trigger = within(row).getByRole("combobox", {
      name: "Eden Job on the team",
    });
    chooseRole(trigger, "Contributor");
    expect(trpc.assign).not.toHaveBeenCalled();
    let dialog = screen.getByRole("alertdialog", {
      name: "Leave the team page?",
    });
    expect(dialog).toHaveTextContent("You will lose access to this team page.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(trpc.assign).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    chooseRole(trigger, "Contributor");
    dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Change my job" }),
    );
    expect(trpc.assign).toHaveBeenCalledExactlyOnceWith({
      slug: "night-owls",
      userId: "editor",
      role: "contributor",
    });
    expect(trpc.push).toHaveBeenCalledExactlyOnceWith(
      "/communities/night-owls/magazine",
    );
    expect(trpc.invalidate).not.toHaveBeenCalled();
    expect(trpc.invalidateSearch).not.toHaveBeenCalled();
  });

  it("warns before removing yourself and redirects after confirmation", () => {
    trpc.staff[2] = {
      ...trpc.staff[2]!,
      role: "editor_in_chief",
      isViewer: true,
    };
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Eden" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("You will lose access to this team page.");
    expect(trpc.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(trpc.remove).toHaveBeenCalledOnce();
    expect(trpc.push).toHaveBeenCalledExactlyOnceWith(
      "/communities/night-owls/magazine",
    );
    expect(trpc.invalidate).not.toHaveBeenCalled();
  });

  it("keeps Add focus while busy, ignores repeats, and returns to search on success", async () => {
    trpc.defer = true;
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    await search();
    fireEvent.click(screen.getByRole("radio", { name: "Ada" }));
    chooseRole(
      within(screen.getByRole("region", { name: "Add someone" })).getByRole(
        "combobox",
      ),
      "Contributor",
    );
    const add = screen.getByRole("button", { name: "Add to the team" });
    add.focus();
    fireEvent.click(add);
    expect(add).toHaveFocus();
    expect(add).not.toBeDisabled();
    expect(add).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(add);
    fireEvent.submit(add.closest("form")!);
    expect(trpc.assign).toHaveBeenCalledOnce();
    expect(
      screen.getAllByRole("status")[0]!.closest("[aria-busy=true]"),
    ).toBeNull();
    act(() => trpc.finishAssign!());
    expect(
      screen.getByRole("textbox", { name: "Find a member" }),
    ).toHaveFocus();
  });

  it("keeps a member's job trigger focus during an update and after success", async () => {
    trpc.defer = true;
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const trigger = screen.getByRole("combobox", {
      name: "Eden Job on the team",
    });
    trigger.focus();
    chooseRole(trigger, "Contributor");
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();
    act(() => trpc.finishAssign!());
    expect(trigger).toHaveFocus();
    expect(trpc.assign).toHaveBeenCalledOnce();
  });

  it("allows Tab and Shift+Tab away from a busy job trigger", () => {
    trpc.pending = true;
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const trigger = screen.getByRole("combobox", {
      name: "Eden Job on the team",
    });
    trigger.focus();
    expect(fireEvent.keyDown(trigger, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(trigger, { key: "Tab", shiftKey: true })).toBe(
      true,
    );
    expect(fireEvent.keyDown(trigger, { key: "ArrowDown" })).toBe(false);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("returns to search when an updated member row is gone", async () => {
    trpc.defer = true;
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const trigger = screen.getByRole("combobox", {
      name: "Eden Job on the team",
    });
    trigger.focus();
    chooseRole(trigger, "Contributor");
    await act(() => vi.advanceTimersByTimeAsync(0));
    trpc.staff = trpc.staff.filter((member) => member.userId !== "editor");
    act(() => trpc.finishAssign!());
    expect(
      screen.getByRole("textbox", { name: "Find a member" }),
    ).toHaveFocus();
  });

  it("adds a found member with the chosen role", async () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    await search();
    fireEvent.click(screen.getByRole("radio", { name: "Ada" }));
    chooseRole(
      within(screen.getByRole("region", { name: "Add someone" })).getByRole(
        "combobox",
        { name: "Job on the team" },
      ),
      "Contributor",
    );
    expect(
      screen.getByText("Writes articles and sends them to the editors."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add to the team" }));
    expect(trpc.assign).toHaveBeenCalledWith({
      slug: "night-owls",
      userId: "ada",
      role: "contributor",
    });
    expect(trpc.invalidate).toHaveBeenCalledWith({ slug: "night-owls" });
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "Ada is now a contributor.",
    );
  });

  it("changes a role from the row", () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const row = screen.getByRole("listitem", { name: "Eden" });
    chooseRole(
      within(row).getByRole("combobox", { name: "Eden Job on the team" }),
      "Editor-in-chief",
    );
    expect(trpc.assign).toHaveBeenCalledWith({
      slug: "night-owls",
      userId: "editor",
      role: "editor_in_chief",
    });
    expect(trpc.invalidate).toHaveBeenCalledWith({ slug: "night-owls" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Eden is now an editor-in-chief.",
    );
  });

  it("removes only after confirming", async () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const row = screen.getByRole("listitem", { name: "Eden" });
    fireEvent.click(within(row).getByRole("button", { name: "Remove Eden" }));
    expect(trpc.remove).not.toHaveBeenCalled();
    let dialog = screen.getByRole("alertdialog", {
      name: "Remove Eden from the team?",
    });
    expect(dialog).toHaveTextContent(
      "They keep their articles. They can no longer write for the magazine or edit issues.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(trpc.remove).not.toHaveBeenCalled();
    expect(
      within(row).getByRole("button", { name: "Remove Eden" }),
    ).toHaveFocus();
    fireEvent.click(within(row).getByRole("button", { name: "Remove Eden" }));
    dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(trpc.remove).toHaveBeenCalledExactlyOnceWith({
      slug: "night-owls",
      userId: "editor",
    });
    expect(trpc.invalidate).toHaveBeenCalledWith({ slug: "night-owls" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Eden is no longer on the team.",
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.getByRole("textbox", { name: "Find a member" }),
    ).toHaveFocus();
  });

  it("owners and admins have no controls", () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    for (const [name, label] of [
      ["Olivia", "Community owner"],
      ["Alex", "Community admin"],
    ]) {
      const row = screen.getByRole("listitem", { name });
      expect(within(row).getByText(label!)).toBeVisible();
      expect(within(row).queryByRole("combobox")).toBeNull();
      expect(within(row).queryByRole("button")).toBeNull();
    }
  });

  it("keeps the confirmation open with a friendly error if removal fails", () => {
    trpc.failure = "UNKNOWN_SERVER_ERROR";
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    fireEvent.click(
      within(screen.getByRole("listitem", { name: "Eden" })).getByRole(
        "button",
        { name: "Remove Eden" },
      ),
    );
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
    expect(trpc.invalidate).not.toHaveBeenCalled();
  });

  it("marks someone who left the community", () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const row = screen.getByRole("listitem", { name: "Fran" });
    expect(within(row).getByText("Not a member now")).toBeVisible();
    expect(within(row).getByText("Contributor")).toBeVisible();
    expect(within(row).queryByRole("combobox")).toBeNull();
    expect(
      within(row).getByRole("button", { name: "Remove Fran" }),
    ).toBeEnabled();
    fireEvent.click(within(row).getByRole("button", { name: "Remove Fran" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(trpc.remove).toHaveBeenCalledWith({
      slug: "night-owls",
      userId: "former",
    });
  });

  it("the add button stays disabled until a person and a role are chosen", async () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    const add = screen.getByRole("button", { name: "Add to the team" });
    expect(add).toBeDisabled();
    await search();
    fireEvent.click(screen.getByRole("radio", { name: "Ada" }));
    expect(add).toBeDisabled();
    chooseRole(
      within(screen.getByRole("region", { name: "Add someone" })).getByRole(
        "combobox",
        { name: "Job on the team" },
      ),
      "Contributor",
    );
    expect(add).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a member" }), {
      target: { value: "gr" },
    });
    expect(add).toBeDisabled();
  });

  it("shows the friendly message for STAFF_NOT_MEMBER", async () => {
    trpc.failure = "STAFF_NOT_MEMBER";
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    await search();
    fireEvent.click(screen.getByRole("radio", { name: "Ada" }));
    chooseRole(
      within(screen.getByRole("region", { name: "Add someone" })).getByRole(
        "combobox",
        { name: "Job on the team" },
      ),
      "Contributor",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to the team" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only members of this community can join the magazine team.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("STAFF_NOT_MEMBER");
    expect(trpc.invalidate).not.toHaveBeenCalled();
  });

  it("search results are a labelled radio group and their count is announced", async () => {
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    expect(
      screen.getByText(
        "Type a name to find members of your community, or a member's agent.",
      ),
    ).toBeVisible();
    expect(trpc.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a member" }), {
      target: { value: "a" },
    });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(trpc.search).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(trpc.search).toHaveBeenCalledWith({
      slug: "night-owls",
      query: "a",
    });
    const results = screen.getByRole("group", { name: "Choose a member" });
    expect(results.tagName).toBe("FIELDSET");
    expect(within(results).getAllByRole("radio")).toHaveLength(2);
    expect(within(results).getByRole("radio", { name: "Ada" })).toHaveAttribute(
      "type",
      "radio",
    );
    expect(
      screen
        .getAllByRole("status")
        .some((line) => line.textContent === "2 members found"),
    ).toBe(true);
  });

  it("explains when no members match", async () => {
    trpc.candidates = [];
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    await search("nobody");
    expect(
      screen.getByText(
        "No members match. Only members of this community, or their agent, can join the team.",
      ),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("status")
        .some((line) => line.textContent === "No members match"),
    ).toBe(true);
  });

  it("shows skeletons while loading the team", () => {
    trpc.loading = true;
    const { container } = renderWithIntl(<MagazineTeam slug="night-owls" />);
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("offers retry when the team cannot load", () => {
    trpc.error = true;
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(trpc.retryStaff).toHaveBeenCalled();
  });

  it("offers retry when search fails", async () => {
    trpc.searchError = true;
    renderWithIntl(<MagazineTeam slug="night-owls" />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(trpc.retrySearch).toHaveBeenCalled();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
