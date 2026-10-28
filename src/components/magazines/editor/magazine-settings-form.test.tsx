import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Magazine } from "@/payload-types";

import { renderWithIntl } from "../test-intl";

type SaveOptions = {
  onSuccess?: (magazine: Magazine) => void;
  onError?: (error: unknown) => void;
};

const trpc = vi.hoisted(() => ({
  settings: null as unknown,
  saveCalls: [] as Record<string, unknown>[],
  saveOutcome: "success" as "success" | { message: string },
  invalidate: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
      magazines: { getSettings: { invalidate: trpc.invalidate } },
      spaces: { list: { invalidate: trpc.invalidate } },
    }),
    magazines: {
      getSettings: {
        useQuery: () => ({
          data: trpc.settings,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      saveSettings: {
        useMutation: (opts: SaveOptions) => ({
          isPending: false,
          mutate: (input: Record<string, unknown>) => {
            trpc.saveCalls.push(input);
            if (trpc.saveOutcome === "success") {
              opts.onSuccess?.({ id: 1 } as Magazine);
            } else {
              opts.onError?.({
                message: trpc.saveOutcome.message,
                data: { magazineItemIndex: null },
              });
            }
          },
        }),
      },
    },
  },
}));

import { MagazineSettingsForm } from "./magazine-settings-form";

const UNLISTED = { slug: "night-owls", isListedInDirectory: false };
const CONFIRM = "I understand, show this outside the community";

function existingMagazine(overrides: Partial<Magazine> = {}): Magazine {
  return {
    id: 3,
    communityId: "c1",
    name: "Agents Weekly",
    slug: "agents-weekly",
    description: "About agents.",
    logoUrl: null,
    topics: [{ topic: "agents" }],
    defaultVisibility: "members",
    publicConfirmedBy: null,
    publicConfirmedAt: null,
    createdBy: "u1",
    updatedAt: "2026-10-20T00:00:00.000Z",
    createdAt: "2026-10-20T00:00:00.000Z",
    ...overrides,
  } as Magazine;
}

beforeEach(() => {
  trpc.saveCalls = [];
  trpc.saveOutcome = "success";
  trpc.invalidate.mockReset();
});

describe("MagazineSettingsForm", () => {
  it("offers preview and asks an unlisted community to confirm it", () => {
    trpc.settings = {
      magazine: existingMagazine(),
      communityIsPrivate: true,
      community: UNLISTED,
    };
    renderWithIntl(<MagazineSettingsForm slug="night-owls" />);
    const visibility = screen.getByRole("radiogroup", {
      name: "Who can read new issues",
    });
    expect(visibility).toHaveAccessibleDescription("Only members can read it.");
    fireEvent.click(
      screen.getByRole("radio", { name: "Preview for everyone" }),
    );
    expect(
      screen.getByText(
        "Everyone sees the cover, the contents and the start of each article. Members read everything.",
      ),
    ).toHaveClass("text-muted-foreground", "text-sm");
    expect(visibility).toHaveAccessibleDescription(
      "Everyone sees the cover, the contents and the start of each article. Members read everything.",
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: CONFIRM }));
    fireEvent.click(save);
    expect(trpc.saveCalls[0]).toMatchObject({
      defaultVisibility: "teaser",
      confirmUnlistedPublic: true,
    });
  });

  it("moving from public to preview keeps the tick; moving to members clears it; moving from preview to everyone asks again", () => {
    trpc.settings = {
      magazine: existingMagazine(),
      communityIsPrivate: true,
      community: UNLISTED,
    };
    renderWithIntl(<MagazineSettingsForm slug="night-owls" />);
    const choose = (name: string) =>
      fireEvent.click(screen.getByRole("radio", { name }));
    const tick = () => screen.getByRole("checkbox", { name: CONFIRM });
    choose("Everyone");
    expect(screen.getByText("Everyone can read all of it.")).toBeVisible();
    fireEvent.click(tick());
    choose("Preview for everyone");
    expect(tick()).toBeChecked();
    choose("Members only");
    choose("Preview for everyone");
    expect(tick()).not.toBeChecked();
    fireEvent.click(tick());
    choose("Everyone");
    expect(tick()).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("a confirmed preview default shows as already confirmed", () => {
    trpc.settings = {
      magazine: existingMagazine({
        defaultVisibility: "teaser",
        publicConfirmedBy: "u1",
        publicConfirmedAt: "2026-10-01T00:00:00.000Z",
      }),
      communityIsPrivate: true,
      community: UNLISTED,
    };
    renderWithIntl(<MagazineSettingsForm slug="night-owls" />);
    expect(screen.getByText(/You already confirmed/)).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: CONFIRM })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(trpc.saveCalls[0]).toMatchObject({ defaultVisibility: "teaser" });
    expect(trpc.saveCalls[0]).not.toHaveProperty("confirmUnlistedPublic");
  });

  it("can hide its Magazine tab link while retaining it by default", () => {
    trpc.settings = {
      magazine: existingMagazine(),
      communityIsPrivate: false,
      community: { ...UNLISTED, isListedInDirectory: true },
    };
    const { unmount } = renderWithIntl(
      <MagazineSettingsForm slug="night-owls" />,
    );
    expect(
      screen.getByRole("link", { name: "Open the Magazine tab" }),
    ).toHaveAttribute("href", "/communities/night-owls/magazine");
    unmount();
    renderWithIntl(
      <MagazineSettingsForm slug="night-owls" showOpenTabLink={false} />,
    );
    expect(
      screen.queryByRole("link", { name: "Open the Magazine tab" }),
    ).toBeNull();
  });

  it("sends confirmUnlistedPublic only when the box is checked", () => {
    trpc.settings = {
      magazine: null,
      communityIsPrivate: true,
      community: UNLISTED,
    };
    renderWithIntl(<MagazineSettingsForm slug="night-owls" />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Night Owls Journal" },
    });
    // The address follows the name until the editor types one.
    expect(screen.getByText("/magazines/night-owls-journal")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Everyone" }));
    const save = screen.getByRole("button", { name: "Create magazine" });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: CONFIRM }));
    fireEvent.click(save);
    expect(trpc.saveCalls).toHaveLength(1);
    expect(trpc.saveCalls[0]).toEqual({
      slug: "night-owls",
      name: "Night Owls Journal",
      magazineSlug: "night-owls-journal",
      logoUrl: null,
      topics: [],
      defaultVisibility: "public",
      confirmUnlistedPublic: true,
    });

    fireEvent.click(screen.getByRole("radio", { name: "Members only" }));
    fireEvent.click(screen.getByRole("button", { name: "Create magazine" }));
    expect(trpc.saveCalls).toHaveLength(2);
    expect(trpc.saveCalls[1]).not.toHaveProperty("confirmUnlistedPublic");
    expect(trpc.saveCalls[1]).toMatchObject({ defaultVisibility: "members" });
  });

  it("does not ask again for a default that is already confirmed", () => {
    trpc.settings = {
      magazine: existingMagazine({
        defaultVisibility: "public",
        publicConfirmedBy: "u1",
        publicConfirmedAt: "2026-10-01T00:00:00.000Z",
      }),
      communityIsPrivate: true,
      community: UNLISTED,
    };
    renderWithIntl(<MagazineSettingsForm slug="night-owls" />);

    expect(screen.queryByRole("checkbox", { name: CONFIRM })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(trpc.saveCalls[0]).toMatchObject({ defaultVisibility: "public" });
    expect(trpc.saveCalls[0]).not.toHaveProperty("confirmUnlistedPublic");
  });

  it("shows a friendly message for MAGAZINE_SLUG_TAKEN", () => {
    trpc.settings = {
      magazine: existingMagazine(),
      communityIsPrivate: false,
      community: { slug: "amsterdam-ai", isListedInDirectory: true },
    };
    trpc.saveOutcome = { message: "MAGAZINE_SLUG_TAKEN" };
    renderWithIntl(<MagazineSettingsForm slug="amsterdam-ai" />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Another magazine already uses this address. Pick a different one.",
    );
    expect(screen.queryByText("MAGAZINE_SLUG_TAKEN")).toBeNull();
  });

  it("keeps the topics to five and blocks an address that is not valid", () => {
    trpc.settings = {
      magazine: existingMagazine(),
      communityIsPrivate: false,
      community: { slug: "amsterdam-ai", isListedInDirectory: true },
    };
    renderWithIntl(<MagazineSettingsForm slug="amsterdam-ai" />);

    const topic = screen.getByLabelText("Topics");
    for (const t of ["evals", "tools", "rag", "voice", "robots"]) {
      fireEvent.change(topic, { target: { value: t } });
      fireEvent.keyDown(topic, { key: "Enter" });
    }
    expect(
      screen.getAllByRole("button", { name: /^Remove topic/ }),
    ).toHaveLength(5);
    expect(topic).toBeDisabled();

    // Removing a topic frees a place and puts focus back in the field.
    fireEvent.click(screen.getByRole("button", { name: "Remove topic rag" }));
    expect(topic).toBeEnabled();
    expect(document.activeElement).toBe(topic);

    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Not OK" },
    });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("uploads a logo from its labelled button and waits for it before saving", async () => {
    trpc.settings = {
      magazine: existingMagazine(),
      communityIsPrivate: false,
      community: { slug: "amsterdam-ai", isListedInDirectory: true },
    };
    let finish: (res: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      renderWithIntl(<MagazineSettingsForm slug="amsterdam-ai" />);

      // The file input is out of the tab order; the button is the control.
      const input =
        document.querySelector<HTMLInputElement>('input[type="file"]')!;
      expect(input).toHaveAttribute("tabindex", "-1");
      const upload = screen.getByRole("button", {
        name: "Logo Upload a logo",
      });
      expect(upload).toHaveAccessibleDescription("A square image works best.");

      fireEvent.change(input, {
        target: { files: [new File(["x"], "logo.png", { type: "image/png" })] },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();

      await act(async () => {
        finish(
          new Response(JSON.stringify({ url: "https://example.test/l.png" })),
        );
      });
      expect(
        screen.getByRole("button", { name: "Logo Replace logo" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
