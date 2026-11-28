import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const auth = vi.hoisted(() => ({
  status: "authenticated" as "pending" | "authenticated" | "guest",
  promptAuth: vi.fn(),
}));

const flow = vi.hoisted(() => ({
  redesigned: false,
  mutate: vi.fn(),
  push: vi.fn(),
  reset: vi.fn(),
  invalidate: vi.fn(),
  onSuccess: undefined as ((community: { slug: string }) => void) | undefined,
  errorCode: null as string | null,
  conflictField: null as "name" | "slug" | null,
  variables: undefined as { name: string; slug?: string } | undefined,
  pending: false,
  checked: vi.fn(),
  waitForCollective: undefined as Promise<void> | undefined,
}));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => flow.redesigned,
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: auth.status,
    promptAuth: auth.promptAuth,
    requireAuth: (
      action: () => void,
      intent?: string,
      options?: { returnTo?: string },
    ) => {
      if (auth.status === "authenticated") action();
      else auth.promptAuth(intent, options);
    },
  }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, values?: { joining: string }) =>
    values ? `${k} ${values.joining}` : k,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: flow.push }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      communities: { invalidate: flow.invalidate },
      client: {
        communities: {
          isSlugAvailable: {
            query: async ({ slug }: { slug: string }) => {
              flow.checked(slug);
              if (slug === "workbench-notes-suggestedsuffix-collective") {
                await flow.waitForCollective;
              }
              if (slug === "ait")
                return { available: false, reason: "reserved" };
              if (
                [
                  "workbench-notes",
                  "workbench-notes-suggestedsuffix-club",
                ].includes(slug)
              )
                return { available: false, reason: "taken" };
              return { available: true };
            },
          },
        },
      },
    }),
    communities: {
      create: {
        useMutation: ({ onSuccess }: { onSuccess: typeof flow.onSuccess }) => {
          flow.onSuccess = onSuccess;
          return {
            mutate: flow.mutate,
            reset: flow.reset,
            isPending: flow.pending,
            isError: flow.errorCode !== null,
            error: flow.errorCode
              ? {
                  data: {
                    code: flow.errorCode,
                    communityCreateConflictField: flow.conflictField,
                  },
                  message: "Create failed",
                }
              : null,
            variables: flow.variables,
          };
        },
      },
    },
  },
}));
vi.mock("@/components/community/building-modal", () => ({
  BuildingModal: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));

import {
  CreateCommunityButton,
  CreateCommunityProvider,
} from "./create-community-dialog";

function Page() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <CreateCommunityProvider>
        <CreateCommunityButton>header</CreateCommunityButton>
        <CreateCommunityButton>invite</CreateCommunityButton>
      </CreateCommunityProvider>
    </QueryClientProvider>
  );
}

// Radix Select (inside the form) measures itself; jsdom lacks ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  },
);

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  flow.redesigned = false;
  flow.errorCode = null;
  flow.conflictField = null;
  flow.variables = undefined;
  flow.pending = false;
  flow.waitForCollective = undefined;
});

describe("CreateCommunityDialog deep link", () => {
  it("stays closed on a plain visit", () => {
    window.history.replaceState(null, "", "/en/communities");
    render(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from ?create=1 for a signed-in member", () => {
    auth.status = "authenticated";
    window.history.replaceState(null, "", "/en/communities?create=1");
    render(<Page />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("asks a guest to sign in and comes back to ?create=1", () => {
    auth.status = "guest";
    window.history.replaceState(null, "", "/en/communities?create=1");
    render(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(auth.promptAuth).toHaveBeenCalledWith("signInToCreate", {
      returnTo: "/en/communities?create=1",
    });
  });
});

describe("CreateCommunityButton", () => {
  it("opens the one shared dialog from any button", () => {
    auth.status = "authenticated";
    window.history.replaceState(null, "", "/en/communities");
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "invite" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("asks a guest to sign in instead of opening", () => {
    auth.status = "guest";
    window.history.replaceState(null, "", "/en/communities");
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "header" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(auth.promptAuth).toHaveBeenCalledWith("signInToCreate", undefined);
  });

  it("keeps the flag-off submission name-derived", () => {
    auth.status = "authenticated";
    window.history.replaceState(null, "", "/en/communities?create=1");
    render(<Page />);
    fireEvent.change(screen.getByPlaceholderText("e.g. PyTorch Amsterdam"), {
      target: { value: "Old flow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(flow.mutate).toHaveBeenCalledWith({
      name: "Old flow",
      description: undefined,
      joinPolicy: "open",
      isListedInDirectory: true,
    });
    expect(screen.queryByRole("button", { name: "editAddress" })).toBeNull();
    expect(flow.checked).not.toHaveBeenCalled();
  });
});

describe("redesigned community setup", () => {
  function open() {
    flow.redesigned = true;
    auth.status = "authenticated";
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    window.history.replaceState(null, "", "/fr/communities");
    const view = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "header" }));
    return view;
  }

  function typeName(value: string) {
    fireEvent.change(screen.getByRole("textbox", { name: "name" }), {
      target: { value },
    });
  }

  it("previews an address generated by the existing name rules and blocks a live collision", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3102");
    open();
    typeName("  Wörkbench Notes  ");
    const address = screen.getByTitle(
      "https://www.aitcommunity.org/communities/workbench-notes",
    );
    expect(address).toHaveTextContent(
      "https://www.aitcommunity.org/communities/workbench-notes",
    );
    expect(
      screen.getByText("https://www.aitcommunity.org/communities/", {
        exact: true,
      }),
    ).toHaveClass("text-muted-foreground");
    const submit = screen.getByRole("button", { name: "submit" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveClass("bg-secondary", "text-muted-foreground");
    const error = await screen.findByText("addressStatus.taken");
    expect(screen.getByText("addressStatus.inUse")).toBeInTheDocument();
    expect(address).toHaveClass("text-destructive");
    expect(address.closest(".ring-destructive")).toBeInTheDocument();
    expect(error.parentElement?.id).toBe(
      screen
        .getByRole("button", { name: "editAddress" })
        .getAttribute("aria-describedby"),
    );
    expect(flow.checked).toHaveBeenCalledWith("workbench-notes");
    expect(screen.getByRole("textbox", { name: "name" })).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(
      screen.getByText("W").closest("[data-community-preview-theme]"),
    ).toHaveAttribute("data-community-preview-theme", "plain");
    expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
    expect(flow.mutate).not.toHaveBeenCalled();

    typeName("☕☕");
    expect(screen.getByText("nameNoAddress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
  });

  it("only offers confirmed variants and applies just the chosen address in one click", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://community.example/nl");
    let finishCollectiveCheck: (() => void) | undefined;
    flow.waitForCollective = new Promise<void>((resolve) => {
      finishCollectiveCheck = resolve;
    });
    open();
    typeName("Workbench Notes");
    await waitFor(() =>
      expect(flow.checked).toHaveBeenCalledWith("workbench-notes-2"),
    );
    expect(
      screen.queryByRole("button", { name: "workbench-notes-2" }),
    ).not.toBeInTheDocument();
    await act(async () => finishCollectiveCheck?.());
    const variant = await screen.findByRole("button", {
      name: "workbench-notes-2",
    });
    expect(variant).toHaveTextContent(/^workbench-notes-2$/);
    expect(variant.querySelector("svg")).toBeNull();
    expect(variant).toHaveClass("whitespace-normal");
    expect(
      screen.queryByRole("button", {
        name: "workbench-notes-suggestedsuffix-club",
      }),
    ).not.toBeInTheDocument();
    expect(flow.checked).toHaveBeenCalledWith("workbench-notes-2");
    expect(
      screen.getByRole("button", { name: "useNameAddress" }),
    ).toBeDisabled();
    fireEvent.click(variant);
    expect(screen.getByRole("textbox", { name: "name" })).toHaveValue(
      "Workbench Notes",
    );
    expect(screen.getByRole("button", { name: "editAddress" })).toHaveFocus();
    expect(await screen.findByText("addressStatus.clear")).toBeInTheDocument();
    expect(
      screen.getByTitle(
        "https://community.example/communities/workbench-notes-2",
      ),
    ).toHaveTextContent(
      "https://community.example/communities/workbench-notes-2",
    );
    const submit = screen.getByRole("button", { name: "submit" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(flow.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Workbench Notes",
        slug: "workbench-notes-2",
      }),
    );
  });

  it("submits the existing open and listed defaults and opens the owner handoff", async () => {
    open();
    expect(screen.getByText("publicSummary joining.open")).toBeInTheDocument();
    typeName("Sketch Club");
    const submit = screen.getByRole("button", { name: "submit" });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(submit).toHaveClass("bg-primary");
    fireEvent.click(submit);
    expect(flow.mutate).toHaveBeenCalledWith({
      name: "Sketch Club",
      description: undefined,
      joinPolicy: "open",
      isListedInDirectory: true,
    });
    act(() => flow.onSuccess?.({ slug: "sketch-club" }));
    expect(flow.invalidate).toHaveBeenCalledOnce();
    expect(flow.push).toHaveBeenCalledWith("/communities/sketch-club");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits a taken address independently, validates it, and submits the chosen address", async () => {
    open();
    typeName("Workbench Notes");
    await screen.findByText("addressStatus.taken");
    fireEvent.click(screen.getByRole("button", { name: "editAddress" }));
    const editor = screen.getByRole("textbox", { name: "customAddress" });
    const submit = screen.getByRole("button", { name: "submit" });
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue("workbench-notes");
    fireEvent.change(editor, { target: { value: "Has spaces" } });
    expect(editor).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
    expect(flow.checked).not.toHaveBeenCalledWith("Has spaces");

    fireEvent.change(editor, { target: { value: "ait" } });
    expect(await screen.findByText("addressStatus.taken")).toBeInTheDocument();
    expect(editor).toHaveAttribute("aria-invalid", "true");
    expect(editor).toHaveAccessibleDescription(/addressStatus.taken/);
    expect(screen.getByRole("textbox", { name: "name" })).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(submit).toBeDisabled();
    expect(flow.checked).toHaveBeenCalledWith("ait");

    fireEvent.change(editor, { target: { value: "weekend-pencils" } });
    typeName("Workbench Sketches");
    expect(editor).toHaveValue("weekend-pencils");
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "doneEditingAddress" }));
    expect(screen.getByRole("button", { name: "editAddress" })).toHaveFocus();
    expect(
      screen.getByTitle(
        "https://www.aitcommunity.org/communities/weekend-pencils",
      ),
    ).toBeInTheDocument();
    fireEvent.click(submit);
    expect(flow.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Workbench Sketches",
        slug: "weekend-pencils",
      }),
    );
    act(() => flow.onSuccess?.({ slug: "weekend-pencils" }));
    expect(flow.push).toHaveBeenCalledWith("/communities/weekend-pencils");
  });

  it("keeps a conflicting custom address when the name changes and can switch back to the derived address", async () => {
    const view = open();
    typeName("Sketch Club");
    fireEvent.click(screen.getByRole("button", { name: "editAddress" }));
    fireEvent.change(screen.getByRole("textbox", { name: "customAddress" }), {
      target: { value: "weekend-pencils" },
    });
    await screen.findByText("addressStatus.clear");
    flow.errorCode = "CONFLICT";
    flow.conflictField = "slug";
    flow.variables = { name: "Sketch Club", slug: "weekend-pencils" };
    view.rerender(<Page />);
    typeName("Sketch Studio");
    expect(flow.reset).not.toHaveBeenCalled();
    expect(screen.getByText("addressStatus.taken")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "useNameAddress" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "useNameAddress" }));
    expect(flow.reset).toHaveBeenCalledOnce();
    expect(
      screen.getByTitle(
        "https://www.aitcommunity.org/communities/sketch-studio",
      ),
    ).toBeInTheDocument();
  });

  it("marks a separately rejected name and keeps the custom address editable", async () => {
    const view = open();
    typeName("Duplicate Name");
    fireEvent.click(screen.getByRole("button", { name: "editAddress" }));
    const editor = screen.getByRole("textbox", { name: "customAddress" });
    fireEvent.change(editor, { target: { value: "different-address" } });
    await screen.findByText("addressStatus.clear");
    flow.errorCode = "CONFLICT";
    flow.conflictField = "name";
    flow.variables = { name: "Duplicate Name", slug: "different-address" };
    view.rerender(<Page />);
    expect(screen.getByRole("textbox", { name: "name" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("nameTaken")).toBeInTheDocument();
    expect(editor).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
    fireEvent.change(editor, { target: { value: "different-address-2" } });
    expect(flow.reset).not.toHaveBeenCalled();
    typeName("Fresh Name");
    expect(flow.reset).toHaveBeenCalledOnce();
    expect(editor).toHaveValue("different-address-2");
  });

  it("preserves optional settings and does not retry a submit-time collision with the same address", async () => {
    const view = open();
    typeName("Sketch Club");
    fireEvent.click(screen.getByText("settings"));
    fireEvent.change(screen.getByRole("textbox", { name: "description" }), {
      target: { value: "A drawing group" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "listLabel" }));
    expect(
      screen.getByText("unlistedSummary joining.open"),
    ).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "submit" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(flow.mutate).toHaveBeenCalledWith({
      name: "Sketch Club",
      description: "A drawing group",
      joinPolicy: "open",
      isListedInDirectory: false,
    });

    flow.errorCode = "CONFLICT";
    flow.conflictField = "slug";
    flow.variables = { name: "Sketch Club" };
    view.rerender(<Page />);
    expect(screen.getByText("addressStatus.taken")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    typeName("Skétch Club!");
    expect(flow.reset).not.toHaveBeenCalled();
    typeName("Another Sketch Club");
    expect(flow.reset).toHaveBeenCalledOnce();
  });

  it("returns a signed-out visitor to their localized directory state, with creation open", () => {
    flow.redesigned = true;
    auth.status = "guest";
    window.history.replaceState(
      null,
      "",
      "/fr/communities?q=ai#all-communities-title",
    );
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "header" }));
    expect(auth.promptAuth).toHaveBeenCalledWith("signInTitle", {
      returnTo:
        "/fr/communities?q=ai&create=1&createAnchor=all-communities-title",
      description: "signInDescription",
    });
  });
});
