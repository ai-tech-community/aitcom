import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        useMutation: (opts: AssignOptions) => ({
          isPending: trpc.pending,
          mutate: (input: Assignment) => {
            trpc.assign(input);
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
                },
                input,
              );
            }
          },
        }),
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
    },
    {
      userId: "admin",
      name: "Alex",
      image: null,
      role: "editor_in_chief",
      source: "admin",
      isActiveMember: true,
    },
    {
      userId: "editor",
      name: "Eden",
      image: null,
      role: "editor",
      source: "assigned",
      isActiveMember: true,
    },
    {
      userId: "former",
      name: "Fran",
      image: null,
      role: "contributor",
      source: "assigned",
      isActiveMember: false,
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
      within(row).getByRole("combobox", { name: "Job on the team" }),
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
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
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
    expect(within(row).getByRole("button", { name: "Remove" })).toHaveFocus();
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(trpc.remove).toHaveBeenCalledExactlyOnceWith({
      slug: "night-owls",
      userId: "editor",
    });
    expect(trpc.invalidate).toHaveBeenCalledWith({ slug: "night-owls" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Eden left the team.");
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
        { name: "Remove" },
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
    expect(within(row).getByRole("button", { name: "Remove" })).toBeEnabled();
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
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
      screen.getByText("Type a name to find members of your community."),
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
        "No members match. Only members of this community can join the team.",
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
