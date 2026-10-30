import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { autoDraftSettings } from "@/components/magazines/test-fixtures";
import { renderWithIntl } from "@/components/magazines/test-intl";
import type { AutoDraftSettings } from "@/lib/magazines/auto-draft";
import type { RouterOutputs } from "@/trpc/react";

type Settings = NonNullable<RouterOutputs["magazines"]["autoDraftSettings"]>;
const trpc = vi.hoisted(() => ({
  data: null as Settings | null,
  calls: [] as Record<string, unknown>[],
  error: null as string | null,
  loading: false,
  queryError: false,
  invalidate: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      magazines: {
        autoDraftSettings: { invalidate: trpc.invalidate },
        autoDraftHistory: { invalidate: trpc.invalidate },
        listIssues: { invalidate: trpc.invalidate },
      },
    }),
    magazines: {
      autoDraftSettings: {
        useQuery: () => ({
          data: trpc.data,
          isLoading: trpc.loading,
          isError: trpc.queryError,
          refetch: trpc.refetch,
        }),
      },
      saveAutoDraftSettings: {
        useMutation: (opts: {
          onSuccess: (value: AutoDraftSettings) => void;
          onError: (error: unknown) => void;
        }) => ({
          isPending: false,
          mutate: (input: Record<string, unknown>) => {
            trpc.calls.push(input);
            if (trpc.error) opts.onError({ message: trpc.error });
            else
              opts.onSuccess({
                ...trpc.data!.settings,
                ...input,
              } as AutoDraftSettings);
          },
        }),
      },
    },
  },
}));
import { AutoDraftSettingsForm } from "./auto-draft-settings-form";

beforeEach(() => {
  trpc.data = autoDraftSettings();
  trpc.calls = [];
  trpc.error = null;
  trpc.loading = false;
  trpc.queryError = false;
  vi.clearAllMocks();
});
const renderForm = () =>
  renderWithIntl(<AutoDraftSettingsForm slug="night-owls" />);
const save = () => screen.getByRole("button", { name: "Save" });

describe("AutoDraftSettingsForm", () => {
  it("offers and saves all three layout choices", () => {
    renderForm();
    const layout = screen.getByRole("combobox", { name: "Layout" });
    expect(
      within(layout)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Cover story", "Long read", "Digest"]);
    fireEvent.change(layout, { target: { value: "digest" } });
    fireEvent.click(save());
    expect(trpc.calls.at(-1)).toMatchObject({ layout: "digest" });
  });
  it("offers preview for drafts and asks for the opt-in in an unlisted community", () => {
    trpc.data = autoDraftSettings({
      communityIsPrivate: true,
      community: { slug: "night-owls", isListedInDirectory: false },
      magazineDefaultVisibility: "teaser",
    });
    renderForm();
    const visibility = screen.getByLabelText("Visibility");
    expect(visibility).toHaveAccessibleDescription(
      "Everyone sees the cover, the contents and the start of each article. Members read everything.",
    );
    expect(
      screen.getByRole("option", { name: "Preview for everyone" }),
    ).toBeInTheDocument();
    fireEvent.change(visibility, { target: { value: "teaser" } });
    expect(save()).toBeDisabled();
    const tick = () => screen.getByRole("checkbox", { name: /I understand/ });
    fireEvent.click(tick());
    fireEvent.change(visibility, { target: { value: "public" } });
    expect(tick()).not.toBeChecked();
    expect(save()).toBeDisabled();
    fireEvent.click(tick());
    fireEvent.change(visibility, { target: { value: "teaser" } });
    expect(tick()).toBeChecked();
    fireEvent.change(visibility, { target: { value: "members" } });
    expect(visibility).toHaveAccessibleDescription("Only members can read it.");
    fireEvent.change(visibility, { target: { value: "teaser" } });
    expect(tick()).not.toBeChecked();
    fireEvent.click(tick());
    fireEvent.click(save());
    expect(trpc.calls[0]).toMatchObject({
      visibility: "teaser",
      confirmUnlistedPublic: true,
    });
  });

  it("shows the saved settings and saves what changed", () => {
    trpc.data!.settings = {
      ...trpc.data!.settings,
      enabled: true,
      cadence: "weekly",
      weekday: 4,
      lookBack: "days_7",
      whenReady: "auto_publish",
      autoPublishDays: 5,
    };
    renderForm();
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("radio", { name: "Every week" })).toBeChecked();
    expect(screen.getByLabelText("Day of the week")).toHaveValue("4");
    expect(
      screen.getByRole("radio", { name: "The last 7 days" }),
    ).toBeChecked();
    expect(screen.getByText(/^Next draft:/).querySelector("time")).toHaveClass(
      "font-mono",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Every month" }));
    fireEvent.change(screen.getByLabelText("Day of the month"), {
      target: { value: "12" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Up to, Forum threads" }),
      { target: { value: "6" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Community events" }));
    fireEvent.click(save());
    expect(trpc.calls).toEqual([
      {
        slug: "night-owls",
        enabled: true,
        cadence: "monthly",
        monthDay: 12,
        weekday: 4,
        lookBack: "days_7",
        layout: "cover-story",
        visibility: null,
        neverReuse: true,
        whenReady: "auto_publish",
        autoPublishDays: 5,
        confirmUnlistedPublic: false,
        sources: {
          article: { enabled: true, max: 5 },
          storyline: { enabled: true, max: 3 },
          event: { enabled: false, max: 4 },
          forumThread: { enabled: true, max: 6 },
          launchpadProject: { enabled: true, max: 3 },
          newsItem: { enabled: true, max: 5 },
          welcome: { enabled: true, max: 1 },
        },
      },
    ]);
  });
  it("enables the day only for the chosen schedule", () => {
    renderForm();
    const month = screen.getByLabelText("Day of the month");
    const week = screen.getByLabelText("Day of the week");
    expect(month).toBeEnabled();
    expect(week).toBeDisabled();
    for (const name of ["Every two weeks", "Every week"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(month).toBeDisabled();
      expect(week).toBeEnabled();
    }
    for (const name of [
      "After each event of the community",
      "Only when I ask",
    ]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(month).toBeDisabled();
      expect(week).toBeDisabled();
    }
  });
  it("gives every control its own name", () => {
    renderForm();
    const names = ["radio", "checkbox", "combobox", "spinbutton"].flatMap(
      (role) => {
        const names: string[] = [];
        const controls = screen.getAllByRole(role);
        screen.getAllByRole(role, {
          name: (name, element) => {
            if (controls.some((control) => control === element))
              names.push(name);
            return true;
          },
        });
        return names;
      },
    );
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(
      screen.getByRole("spinbutton", { name: "Up to, Forum threads" }),
    ).toBeVisible();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio.closest("label")?.querySelector("select")).toBeFalsy();
  });
  it("shows Up to only where more than one item is allowed", () => {
    renderForm();
    expect(screen.getAllByRole("spinbutton", { name: /^Up to,/ })).toHaveLength(
      6,
    );
    expect(
      screen.queryByRole("spinbutton", { name: "Up to, Welcome new members" }),
    ).toBeNull();
  });
  it("explains invalid counts and lets editors turn those options off", () => {
    renderForm();
    const max = screen.getByRole("spinbutton", {
      name: "Up to, Forum threads",
    });
    fireEvent.change(max, { target: { value: "" } });
    expect(max).toHaveAttribute("aria-invalid", "true");
    expect(max).toHaveAccessibleDescription("Use a whole number from 1 to 10.");
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Forum threads" }));
    expect(save()).toBeEnabled();
    fireEvent.click(
      screen.getByRole("radio", { name: /^Publish it by itself/ }),
    );
    const days = screen.getByRole("spinbutton", {
      name: "Days before it goes out",
    });
    fireEvent.change(days, { target: { value: "15" } });
    expect(days).toHaveAttribute("aria-invalid", "true");
    expect(days).toHaveAccessibleDescription(/Use a whole number from 1 to 14/);
    expect(save()).toBeDisabled();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Tell the editors, and we publish by hand",
      }),
    );
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(trpc.calls[0]).toMatchObject({
      autoPublishDays: 3,
      sources: { forumThread: { enabled: false, max: 3 } },
    });
  });
  it("asks an unlisted community to confirm Everyone", () => {
    trpc.data = autoDraftSettings({
      communityIsPrivate: true,
      community: { slug: "night-owls", isListedInDirectory: false },
    });
    renderForm();
    fireEvent.change(screen.getByLabelText("Visibility"), {
      target: { value: "public" },
    });
    expect(save()).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I understand, show this outside the community",
      }),
    );
    fireEvent.click(save());
    expect(trpc.calls[0]).toMatchObject({
      visibility: "public",
      confirmUnlistedPublic: true,
    });
    fireEvent.change(screen.getByLabelText("Visibility"), {
      target: { value: "members" },
    });
    fireEvent.click(save());
    expect(trpc.calls[1]).toMatchObject({
      visibility: "members",
      confirmUnlistedPublic: false,
    });
  });
  it("does not ask again for a saved confirmation or an inherited default", () => {
    trpc.data = autoDraftSettings({
      communityIsPrivate: true,
      community: { slug: "night-owls", isListedInDirectory: false },
      magazineDefaultVisibility: "public",
    });
    trpc.data.settings = {
      ...trpc.data.settings,
      visibility: "public",
      publicConfirmedBy: "leader",
      publicConfirmedAt: "2026-10-01T00:00:00Z",
    };
    renderForm();
    expect(screen.queryByRole("checkbox", { name: /I understand/ })).toBeNull();
    expect(save()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Visibility"), {
      target: { value: "inherit" },
    });
    expect(save()).toBeEnabled();
  });
  it("is read-only for editors who cannot manage", () => {
    trpc.data!.canManage = false;
    renderForm();
    for (const role of [
      "radio",
      "checkbox",
      "combobox",
      "spinbutton",
      "switch",
    ])
      for (const control of screen.getAllByRole(role))
        expect(control).toBeDisabled();
    expect(
      screen.getByText("Only the editor-in-chief can change these."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  it("tells you to add topics for AIT News", () => {
    trpc.data!.hasTopics = false;
    renderForm();
    expect(
      screen.getAllByText("Add topics to your magazine to get AIT News."),
    ).toHaveLength(2);
    for (const name of ["AIT News stories", "AIT News headlines"])
      expect(
        screen.getByRole("checkbox", { name }),
      ).toHaveAccessibleDescription(/Add topics/);
    expect(
      screen.getAllByRole("link", {
        name: "Add topics to your magazine to get AIT News.",
      })[0],
    ).toHaveAttribute("href", "/communities/night-owls/magazine/settings");
  });
  it("announces Saved", () => {
    renderForm();
    const status = screen
      .getAllByRole("status")
      .find((element) => !element.textContent)!;
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(save());
    expect(screen.getByText("Saved.")).toBe(status);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getAllByRole("status")).toContain(status);
    expect(status).toBeEmptyDOMElement();
    expect(trpc.invalidate).toHaveBeenCalledWith({ slug: "night-owls" });
  });
  it("keeps the auto-publish label readable when its day count is invalid", () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /^Publish it by itself/ }),
    );
    const days = screen.getByRole("spinbutton", {
      name: "Days before it goes out",
    });
    for (const value of ["", "0", "15"]) {
      fireEvent.change(days, { target: { value } });
      expect(
        screen.getByRole("radio", { name: /^Publish it by itself/ }),
      ).toHaveAccessibleName(
        "Publish it by itself after 3 days, unless someone stops it",
      );
      expect(document.body).not.toHaveTextContent("NaN");
    }
  });
  it.each(["enabled", "cadence", "monthDay", "weekday"])(
    "shows a save hint when the %s schedule value changes",
    (field) => {
      if (field === "weekday") trpc.data!.settings.cadence = "weekly";
      renderForm();
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAccessibleDescription(/^Next draft:/);
      if (field === "enabled") fireEvent.click(toggle);
      if (field === "cadence")
        fireEvent.click(screen.getByRole("radio", { name: "Every week" }));
      if (field === "monthDay")
        fireEvent.change(screen.getByLabelText("Day of the month"), {
          target: { value: "12" },
        });
      if (field === "weekday")
        fireEvent.change(screen.getByLabelText("Day of the week"), {
          target: { value: "4" },
        });
      expect(screen.queryByText(/^Next draft:/)).toBeNull();
      expect(toggle).toHaveAccessibleDescription(
        "The next date updates when you save.",
      );
      const description = document.getElementById(
        toggle.getAttribute("aria-describedby")!,
      );
      expect(description).toBeVisible();
    },
  );
  it("keeps the next date when only the picked content changes", () => {
    renderForm();
    fireEvent.click(screen.getByRole("checkbox", { name: "Community events" }));
    expect(screen.getByRole("switch")).toHaveAccessibleDescription(
      /^Next draft:/,
    );
  });
  it("does not describe an unchanged schedule with a missing next date", () => {
    trpc.data!.nextDraftAt = null;
    renderForm();
    expect(screen.getByRole("switch")).not.toHaveAttribute("aria-describedby");
  });
  it("explains how each source is picked", () => {
    renderForm();
    const help = {
      "Member articles ready for the magazine":
        "Approved and waiting longest first",
      "AIT News stories": "Stories about your topics, newest updates first",
      "Community events":
        "Coming up soonest first, then past events with the most people going",
      "Forum threads": "Most replies, then most views",
      "Launchpad projects": "Most upvotes",
      "AIT News headlines": "Headlines about your topics, newest first",
      "Welcome new members":
        "A welcome when new people join, with a count and no names",
    };
    for (const [name, description] of Object.entries(help)) {
      const checkbox = screen.getByRole("checkbox", { name });
      expect(checkbox).toHaveAccessibleDescription(description);
      expect(
        document.getElementById(checkbox.getAttribute("aria-describedby")!),
      ).toHaveClass("text-muted-foreground", "text-sm");
    }
  });
  it("maps save errors to plain words", () => {
    trpc.error = "UNLISTED_PUBLIC_LEADERS_ONLY";
    renderForm();
    fireEvent.click(save());
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "UNLISTED_PUBLIC_LEADERS_ONLY",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/community/);
  });
  it("shows a skeleton while loading and a retry after a load error", () => {
    trpc.loading = true;
    const { unmount } = renderForm();
    expect(
      document.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    unmount();
    trpc.loading = false;
    trpc.queryError = true;
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(trpc.refetch).toHaveBeenCalled();
    expect(
      within(screen.getByRole("alert")).getByText(/could not be loaded/),
    ).toBeVisible();
  });
});
