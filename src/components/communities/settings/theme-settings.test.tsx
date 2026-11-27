import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useCallback } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as PreviewModule from "@/components/communities/theme/community-theme-preview";
import type { CommunityThemeId } from "@/lib/communities/themes";

import en from "../../../../messages/en.json";

type MutationOptions = {
  onSuccess?: (data: { themeId: CommunityThemeId }) => unknown;
  onError?: (error: Error) => unknown;
};

const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidate: vi.fn(() => Promise.resolve()),
  setPreviewId: vi.fn(),
  mutationOptions: {} as MutationOptions,
  isPending: false,
  community: {
    data: undefined as
      | {
          name: string;
          themeId: string;
          bannerUrl: string | null;
          bannerAlt: string | null;
        }
      | undefined,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      communities: { getBySlug: { invalidate: m.invalidate } },
    }),
    communities: {
      getBySlug: { useQuery: () => m.community },
      setTheme: {
        useMutation: (options: MutationOptions) => {
          m.mutationOptions = options;
          return { mutate: m.mutate, isPending: m.isPending };
        },
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The real preview context, with a spy on every `setPreviewId` call. The
// spy stays stable across renders, as the provider's state setter is.
vi.mock(
  "@/components/communities/theme/community-theme-preview",
  async (importOriginal) => {
    const actual = await importOriginal<typeof PreviewModule>();
    return {
      ...actual,
      useCommunityThemePreview: () => {
        const real = actual.useCommunityThemePreview();
        const { setPreviewId: realSet } = real;
        const setPreviewId = useCallback(
          (id: CommunityThemeId | null) => {
            m.setPreviewId(id);
            realSet(id);
          },
          [realSet],
        );
        return { previewId: real.previewId, setPreviewId };
      },
    };
  },
);

import {
  CommunityThemePreviewProvider,
  useShownCommunityThemeId,
} from "@/components/communities/theme/community-theme-preview";

import { ThemeSettings } from "./theme-settings";

const copy = en.communities.settings.themes;

/** Stands in for the community frame: shows the look it would paint. */
function ShownLook() {
  return <p data-testid="shown-look">{useShownCommunityThemeId("canal")}</p>;
}

function Harness({ showSettings = true }: { showSettings?: boolean }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityThemePreviewProvider>
        <ShownLook />
        {showSettings ? <ThemeSettings slug="belong" /> : null}
      </CommunityThemePreviewProvider>
    </NextIntlClientProvider>
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });
const shownLook = () => screen.getByTestId("shown-look").textContent;

beforeEach(() => {
  vi.clearAllMocks();
  m.mutationOptions = {};
  m.isPending = false;
  m.community = {
    data: {
      name: "Belong",
      themeId: "canal",
      bannerUrl: null,
      bannerAlt: null,
    },
    isError: false,
    refetch: vi.fn(),
  };
});

describe("ThemeSettings", () => {
  it("offers the five looks in catalog order, the saved one chosen and marked Current", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: copy.title });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(
      ["Plain", "Canal", "Meadow", "Sunset", "Night"].map((name) =>
        radios.indexOf(radio(name)),
      ),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(radio("Canal")).toHaveAttribute("aria-checked", "true");
    expect(radio("Night")).toHaveAttribute("aria-checked", "false");
    expect(radio("Canal")).toHaveAccessibleDescription(
      expect.stringContaining(copy.current),
    );
    expect(radio("Night")).not.toHaveAccessibleDescription(
      expect.stringContaining(copy.current),
    );
  });

  it("titles the section with an h2, under the identity's h1", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: copy.title }).tagName).toBe(
      "H2",
    );
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("is one tab stop that lands on the chosen look", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    // Roving tab index: no radio is a tab stop of its own; tabbing into the
    // group hands focus to the chosen look, which then holds the stop.
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, -1, -1, -1]);
    act(() => screen.getByRole("radiogroup").focus());
    expect(radio("Canal")).toHaveFocus();
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
  });

  it("draws each tile with the community's name", () => {
    render(<Harness />);
    expect(screen.getAllByText("Belong")).toHaveLength(5);
  });

  it("shows the community's banner on every tile when it has one", () => {
    m.community.data = {
      ...m.community.data!,
      bannerUrl: "https://cdn.example/banner.jpg",
    };
    const { container } = render(<Harness />);
    const banners = container.querySelectorAll(
      'img[src="https://cdn.example/banner.jpg"]',
    );
    expect(banners).toHaveLength(5);
  });

  it("previews a look when it is chosen and offers Save", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: copy.save })).toBeNull();

    fireEvent.click(radio("Night"));

    expect(m.setPreviewId).toHaveBeenCalledWith("night");
    expect(shownLook()).toBe("night");
    expect(radio("Night")).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(copy.previewing.replace("{name}", "Night")),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.save })).toBeInTheDocument();
  });

  it("drops the preview when the saved look is chosen again", () => {
    render(<Harness />);
    fireEvent.click(radio("Night"));
    fireEvent.click(radio("Canal"));
    expect(m.setPreviewId).toHaveBeenLastCalledWith(null);
    expect(shownLook()).toBe("canal");
    expect(screen.queryByRole("button", { name: copy.save })).toBeNull();
  });

  it("saves exactly the previewed look", () => {
    render(<Harness />);
    fireEvent.click(radio("Night"));
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    expect(m.mutate).toHaveBeenCalledTimes(1);
    expect(m.mutate).toHaveBeenCalledWith({ slug: "belong", themeId: "night" });
  });

  it("after a save, refreshes the community and then drops the preview", async () => {
    render(<Harness />);
    fireEvent.click(radio("Night"));
    m.setPreviewId.mockClear();

    await act(async () => {
      await m.mutationOptions.onSuccess?.({ themeId: "night" });
    });

    expect(m.invalidate).toHaveBeenCalledWith({ slug: "belong" });
    expect(m.setPreviewId).toHaveBeenCalledWith(null);
    expect(m.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      m.setPreviewId.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps the preview when the save fails", async () => {
    render(<Harness />);
    fireEvent.click(radio("Night"));
    m.setPreviewId.mockClear();

    await act(async () => {
      await m.mutationOptions.onError?.(new Error("boom"));
    });

    expect(m.setPreviewId).not.toHaveBeenCalled();
    expect(shownLook()).toBe("night");
    expect(screen.getByRole("button", { name: copy.save })).toBeInTheDocument();
  });

  it("locks the choice while a save is on its way", () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(radio("Night"));

    m.isPending = true;
    rerender(<Harness />);

    for (const look of screen.getAllByRole("radio")) {
      expect(look).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
    expect(screen.getByRole("button", { name: copy.cancel })).toBeDisabled();

    // A click on another look cannot replace the one being saved.
    m.setPreviewId.mockClear();
    fireEvent.click(radio("Meadow"));
    expect(m.setPreviewId).not.toHaveBeenCalled();
    expect(shownLook()).toBe("night");
  });

  it("cancels the preview without saving", () => {
    render(<Harness />);
    fireEvent.click(radio("Night"));
    fireEvent.click(screen.getByRole("button", { name: copy.cancel }));
    expect(m.setPreviewId).toHaveBeenLastCalledWith(null);
    expect(m.mutate).not.toHaveBeenCalled();
    expect(shownLook()).toBe("canal");
    expect(radio("Canal")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: copy.save })).toBeNull();
  });

  it("drops the preview when the page is left", () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(radio("Night"));
    m.setPreviewId.mockClear();

    rerender(<Harness showSettings={false} />);

    expect(m.setPreviewId).toHaveBeenCalledWith(null);
    expect(shownLook()).toBe("canal");
  });

  it("moves to the next look with ArrowRight, and previews it", async () => {
    render(<Harness />);
    act(() => radio("Canal").focus());
    fireEvent.keyDown(radio("Canal"), { key: "ArrowRight" });
    await waitFor(() => expect(radio("Meadow")).toHaveFocus());
    expect(m.setPreviewId).toHaveBeenCalledWith("meadow");
  });

  it("wraps from the last look to the first", async () => {
    m.community.data = { ...m.community.data!, themeId: "night" };
    render(<Harness />);
    act(() => radio("Night").focus());
    fireEvent.keyDown(radio("Night"), { key: "ArrowDown" });
    await waitFor(() => expect(radio("Plain")).toHaveFocus());
  });

  it("says the community did not load, and retries", () => {
    m.community = { data: undefined, isError: true, refetch: vi.fn() };
    render(<Harness />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(m.community.refetch).toHaveBeenCalledTimes(1);
  });
});
