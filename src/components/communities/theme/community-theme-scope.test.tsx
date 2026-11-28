import { StrictMode, useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import {
  COMMUNITY_THEMES,
  resolveCommunityTheme,
  type CommunityThemeId,
} from "@/lib/communities/themes";

// Next compiles font loaders; a unit test gets one class per face.
const fonts = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock("next/font/google", () => {
  const face = (name: string) => (options: Record<string, unknown>) => {
    fonts.calls.push({ face: name, ...options });
    return { variable: `${name}-variable`, className: `${name}-class` };
  };
  return {
    Fraunces: face("fraunces"),
    Nunito: face("nunito"),
    DM_Serif_Display: face("dm-serif-display"),
    Space_Grotesk: face("space-grotesk"),
  };
});

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { NextIntlClientProvider } from "next-intl";

import { ConfirmProvider, useConfirm } from "@/components/confirm-dialog";
import en from "../../../../messages/en.json";

import { CommunityCoverArt } from "./community-cover-art";
import { COMMUNITY_COVER_ART } from "./cover-art";
import { CommunityThemeCover } from "./community-theme-cover";
import {
  CommunityThemePreviewProvider,
  useCommunityThemePreview,
} from "./community-theme-preview";
import { CommunityThemeScope } from "./community-theme-scope";

const FACE_CLASSES = [
  "fraunces-variable",
  "nunito-variable",
  "dm-serif-display-variable",
  "space-grotesk-variable",
];

function scopeOf(container: HTMLElement): HTMLElement {
  const scope = container.querySelector<HTMLElement>("[data-community-theme]");
  if (!scope) throw new Error("no community theme scope");
  return scope;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every token a look may re-declare, as the custom property it sets. */
const TOKEN_PROPERTIES = [
  "--card",
  "--card-foreground",
  "--muted",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--accent-foreground",
  "--popover",
  "--popover-foreground",
  "--success",
  "--warning",
  "--info",
  "--destructive",
];

function renderScope(themeId: CommunityThemeId) {
  const { container } = render(
    <CommunityThemeScope themeId={themeId} className="px-4">
      <p>page</p>
    </CommunityThemeScope>,
  );
  return scopeOf(container);
}

describe("CommunityThemeScope", () => {
  it("re-declares the look's tokens on the frame (canal)", () => {
    const canal = resolveCommunityTheme("canal");
    const scope = renderScope("canal");

    expect(scope).toHaveAttribute("data-community-theme", "canal");
    expect(scope).not.toHaveClass("dark");
    expect(scope).toHaveClass("px-4", "bg-background", "text-foreground");
    expect(scope.style.getPropertyValue("--background")).toBe(
      canal.tokens.background,
    );
    expect(scope.style.getPropertyValue("--foreground")).toBe(
      canal.tokens.foreground,
    );
    expect(scope.style.getPropertyValue("--muted-foreground")).toBe(
      canal.tokens.mutedForeground,
    );
    expect(scope.style.getPropertyValue("--border")).toBe(canal.tokens.border);
    expect(scope.style.getPropertyValue("--input")).toBe(canal.tokens.input);
    expect(scope.style.getPropertyValue("--card")).toBe("");
    expect(scope).toContainElement(screen.getByText("page"));
  });

  it("deepens the status colors on a tinted light look (canal)", () => {
    const canal = resolveCommunityTheme("canal");
    const scope = renderScope("canal");
    for (const name of ["success", "warning", "info", "destructive"] as const) {
      expect(scope.style.getPropertyValue(`--${name}`)).toBe(
        canal.tokens[name],
      );
    }
  });

  it("tells the browser which scheme the frame is in", () => {
    expect(renderScope("canal").style.colorScheme).toBe("light");
    expect(renderScope("plain").style.colorScheme).toBe("light");
    expect(renderScope("night").style.colorScheme).toBe("dark");
  });

  it("turns off faux bold for a heading face with one weight (sunset)", () => {
    expect(
      renderScope("sunset").style.getPropertyValue(
        "--community-heading-synthesis",
      ),
    ).toBe("none");
    expect(
      renderScope("canal").style.getPropertyValue(
        "--community-heading-synthesis",
      ),
    ).toBe("");
  });

  it("paints the look's canvas pattern and hands its cover palette to the art", () => {
    const canal = resolveCommunityTheme("canal");
    const scope = renderScope("canal");

    expect(scope.style.getPropertyValue("--community-canvas-image")).toBe(
      canal.canvasPattern!.image,
    );
    expect(scope.style.getPropertyValue("--community-canvas-size")).toBe(
      canal.canvasPattern!.size,
    );
    for (const [key, color] of Object.entries(canal.cover!.palette)) {
      expect(scope.style.getPropertyValue(`--community-cover-${key}`)).toBe(
        color,
      );
    }
  });

  it("loads only the look's heading face", () => {
    const scope = renderScope("canal");
    expect(scope).toHaveClass("fraunces-variable");
    for (const other of FACE_CLASSES.filter((c) => c !== "fraunces-variable")) {
      expect(scope).not.toHaveClass(other);
    }
  });

  it("declares every heading face lazily, on the one heading variable", () => {
    expect(fonts.calls.map((call) => call.face).sort()).toEqual([
      "dm-serif-display",
      "fraunces",
      "nunito",
      "space-grotesk",
    ]);
    for (const call of fonts.calls) {
      expect(call).toMatchObject({
        variable: "--community-heading-face",
        preload: false,
        display: "swap",
        subsets: ["latin", "latin-ext"],
      });
      expect(call).not.toHaveProperty("adjustFontFallback", false);
    }
  });

  it("takes the dark tokens and dark cards for a dark look (night)", () => {
    const night = resolveCommunityTheme("night");
    const scope = renderScope("night");

    expect(scope).toHaveAttribute("data-community-theme", "night");
    expect(scope).toHaveClass("dark", "space-grotesk-variable");
    expect(scope.style.getPropertyValue("--background")).toBe(
      night.tokens.background,
    );
    expect(scope.style.getPropertyValue("--card")).toBe(night.tokens.card);
    expect(scope.style.getPropertyValue("--card-foreground")).toBe(
      night.tokens.cardForeground,
    );
    // Quiet fills are indigo too, not `.dark`'s gray.
    expect(scope.style.getPropertyValue("--muted")).toBe(night.tokens.muted);
    expect(scope.style.getPropertyValue("--secondary")).toBe(
      night.tokens.secondary,
    );
    expect(scope.style.getPropertyValue("--secondary-foreground")).toBe(
      night.tokens.secondaryForeground,
    );
    expect(scope.style.getPropertyValue("--accent")).toBe(night.tokens.accent);
    expect(scope.style.getPropertyValue("--accent-foreground")).toBe(
      night.tokens.accentForeground,
    );
    expect(scope.style.getPropertyValue("--destructive")).toBe(
      night.tokens.destructive,
    );
  });

  it("keeps the house look for plain: no card, pattern, cover or face", () => {
    const scope = renderScope("plain");

    expect(scope).toHaveAttribute("data-community-theme", "plain");
    expect(scope).not.toHaveClass("dark");
    for (const property of TOKEN_PROPERTIES) {
      expect(scope.style.getPropertyValue(property), property).toBe("");
    }
    expect(scope.style.getPropertyValue("--community-canvas-image")).toBe("");
    for (const face of FACE_CLASSES) expect(scope).not.toHaveClass(face);
    const coverVars = Array.from(scope.style).filter((name) =>
      name.startsWith("--community-cover-"),
    );
    expect(coverVars).toEqual([]);
  });

  it("shows a previewed look, and the saved look again once the preview is cleared", () => {
    let setPreview!: (id: CommunityThemeId | null) => void;

    // Stands in for the Themes page (Task 7): it previews a look and clears
    // the preview when it goes away.
    function Previewer() {
      const { setPreviewId } = useCommunityThemePreview();
      setPreview = setPreviewId;
      useEffect(() => () => setPreviewId(null), [setPreviewId]);
      return null;
    }

    let hidePreviewer!: () => void;
    function Page() {
      const [shown, setShown] = useState(true);
      hidePreviewer = () => setShown(false);
      return shown ? <Previewer /> : null;
    }

    const { container } = render(
      <CommunityThemePreviewProvider>
        <CommunityThemeScope themeId="canal">
          <Page />
        </CommunityThemeScope>
      </CommunityThemePreviewProvider>,
    );
    expect(scopeOf(container)).toHaveAttribute("data-community-theme", "canal");

    act(() => setPreview("night"));
    expect(scopeOf(container)).toHaveAttribute("data-community-theme", "night");
    expect(scopeOf(container)).toHaveClass("dark");

    act(() => hidePreviewer());
    expect(scopeOf(container)).toHaveAttribute("data-community-theme", "canal");
    expect(scopeOf(container)).not.toHaveClass("dark");
  });

  it("refuses a preview outside a provider", () => {
    function Orphan() {
      useCommunityThemePreview();
      return null;
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow(/CommunityThemePreviewProvider/);
  });
});

/** The look's floating layer, which the scope mounts on `body`. */
function layerOf(): HTMLElement {
  const layer = document.body.querySelector<HTMLElement>(
    ":scope > [data-community-theme-layer]",
  );
  if (!layer) throw new Error("no community theme layer on body");
  return layer;
}

describe("CommunityThemeScope floating layer", () => {
  it("wears the look on body, outside the frame, and paints nothing itself (night)", () => {
    const night = resolveCommunityTheme("night");
    const scope = renderScope("night");
    const layer = layerOf();

    expect(scope.contains(layer)).toBe(false);
    expect(layer).toHaveAttribute("data-community-theme-layer", "night");
    expect(layer).toHaveClass(
      "dark",
      "space-grotesk-variable",
      "contents",
      // Text takes the look's ink, not the color `body` computed.
      "text-foreground",
    );
    // Dialogs and sheets sit on the card's ground, not the canvas.
    expect(layer.style.getPropertyValue("--background")).toBe(
      night.tokens.card,
    );
    expect(layer.style.getPropertyValue("--foreground")).toBe(
      night.tokens.cardForeground,
    );
    expect(layer.style.getPropertyValue("--popover")).toBe(
      night.tokens.popover,
    );
    expect(layer.style.getPropertyValue("--popover-foreground")).toBe(
      night.tokens.popoverForeground,
    );
    expect(layer.style.getPropertyValue("--card")).toBe(night.tokens.card);
    expect(layer.style.colorScheme).toBe("dark");
    // The canvas and cover belong to the page, not to a menu.
    expect(layer).not.toHaveAttribute("data-community-theme");
    expect(layer.style.getPropertyValue("--community-canvas-image")).toBe("");
    const coverVars = Array.from(layer.style).filter((name) =>
      name.startsWith("--community-cover-"),
    );
    expect(coverVars).toEqual([]);
  });

  it("keeps the house white ground for dialogs on a light look (canal)", () => {
    const canal = resolveCommunityTheme("canal");
    renderScope("canal");
    const layer = layerOf();

    expect(layer).not.toHaveClass("dark");
    expect(layer).toHaveClass("text-foreground");
    expect(layer.style.getPropertyValue("--background")).toBe("");
    expect(layer.style.getPropertyValue("--foreground")).toBe(
      canal.tokens.foreground,
    );
    expect(layer.style.getPropertyValue("--info")).toBe(canal.tokens.info);
    expect(layer.style.colorScheme).toBe("light");
  });

  it("opens a popover from the page inside the layer", () => {
    render(
      <CommunityThemeScope themeId="night">
        <Popover open>
          <PopoverTrigger>Open</PopoverTrigger>
          <PopoverContent>Menu</PopoverContent>
        </Popover>
      </CommunityThemeScope>,
    );

    const content = screen.getByText("Menu");
    expect(layerOf().contains(content)).toBe(true);
    expect(content.closest("[data-community-theme]")).toBeNull();
  });

  it("follows a previewed look", () => {
    let setPreview!: (id: CommunityThemeId | null) => void;
    function Previewer() {
      setPreview = useCommunityThemePreview().setPreviewId;
      return null;
    }
    render(
      <CommunityThemePreviewProvider>
        <CommunityThemeScope themeId="canal">
          <Previewer />
        </CommunityThemeScope>
      </CommunityThemePreviewProvider>,
    );
    expect(layerOf()).toHaveAttribute("data-community-theme-layer", "canal");
    expect(layerOf()).not.toHaveClass("dark");

    act(() => setPreview("night"));
    expect(layerOf()).toHaveAttribute("data-community-theme-layer", "night");
    expect(layerOf()).toHaveClass("dark");
  });

  it("hydrates a dialog open on first paint without a mismatch, inside the layer", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const page = (
      <CommunityThemeScope themeId="night">
        <Popover open>
          <PopoverTrigger>Open</PopoverTrigger>
          <PopoverContent>Menu</PopoverContent>
        </Popover>
      </CommunityThemeScope>
    );
    const host = document.createElement("div");
    host.innerHTML = renderToString(page);
    document.body.append(host);
    const recoverable = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, page, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(layerOf().contains(screen.getByText("Menu"))).toBe(true);
    act(() => root.unmount());
    host.remove();
  });

  it("opens a confirm asked for as the community first loads inside the layer", () => {
    // A deep link that asks once, at once, in the commit the layer is made
    // (like `useGalleryUploadLink`, which marks the link handled).
    function AsksOnMount() {
      const confirm = useConfirm();
      const asked = useRef(false);
      useEffect(() => {
        if (asked.current) return;
        asked.current = true;
        void confirm({ description: "Delete this photo?" });
      }, [confirm]);
      return null;
    }
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ConfirmProvider>
          <CommunityThemeScope themeId="night">
            <AsksOnMount />
          </CommunityThemeScope>
        </ConfirmProvider>
      </NextIntlClientProvider>,
    );

    expect(layerOf()).toContainElement(screen.getByRole("alertdialog"));
  });

  it("keeps a confirm asked on first load visible under Strict Mode's double effects", () => {
    function AsksOnMount() {
      const confirm = useConfirm();
      const asked = useRef(false);
      useEffect(() => {
        if (asked.current) return;
        asked.current = true;
        void confirm({ description: "Delete this photo?" });
      }, [confirm]);
      return null;
    }
    render(
      <StrictMode>
        <NextIntlClientProvider locale="en" messages={en}>
          <ConfirmProvider>
            <CommunityThemeScope themeId="night">
              <AsksOnMount />
            </CommunityThemeScope>
          </ConfirmProvider>
        </NextIntlClientProvider>
      </StrictMode>,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.isConnected).toBe(true);
    expect(layerOf()).toContainElement(dialog);
  });

  it("moves an open confirm to body when the community goes away, still usable", async () => {
    let ask!: ReturnType<typeof useConfirm>;
    function Asker() {
      ask = useConfirm();
      return null;
    }
    let leave!: () => void;
    function Page() {
      const [inCommunity, setInCommunity] = useState(true);
      leave = () => setInCommunity(false);
      return inCommunity ? (
        <CommunityThemeScope themeId="night">
          <Asker />
        </CommunityThemeScope>
      ) : null;
    }
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ConfirmProvider>
          <Page />
        </ConfirmProvider>
      </NextIntlClientProvider>,
    );
    let answer!: Promise<boolean>;
    act(() => {
      answer = ask({ description: "Delete this photo?" });
    });
    expect(layerOf()).toContainElement(screen.getByRole("alertdialog"));

    // The community unmounts (left, deleted, made private) with the
    // question still open.
    act(() => leave());

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.isConnected).toBe(true);
    expect(dialog.closest("[data-community-theme-layer]")).toBeNull();
    act(() => screen.getByRole("button", { name: "Cancel" }).click());
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("removes the layer with the frame", () => {
    const { unmount } = render(
      <CommunityThemeScope themeId="meadow">
        <p>page</p>
      </CommunityThemeScope>,
    );
    expect(layerOf()).toBeInTheDocument();

    unmount();
    expect(
      document.body.querySelector("[data-community-theme-layer]"),
    ).toBeNull();
  });
});

describe("CommunityThemeCover", () => {
  const base = {
    name: "MLOps Amsterdam",
    bannerUrl: null as string | null,
    bannerAlt: null as string | null,
  };

  it("shows the generated art without copying the header name", () => {
    const { container } = render(
      <CommunityThemeCover
        community={{ ...base, themeId: "night" }}
        showName={false}
      />,
    );
    expect(
      container.querySelector("[data-community-cover-art]"),
    ).toBeInTheDocument();
    expect(screen.queryByText(base.name)).toBeNull();
  });

  it("shows the banner picture when there is one, never the art", () => {
    const { container } = render(
      <CommunityThemeCover
        community={{
          ...base,
          themeId: "canal",
          bannerUrl: "https://cdn.example.test/banner.png",
        }}
      />,
    );
    expect(
      container.querySelector("img[data-community-banner]"),
    ).toHaveAttribute("src", "https://cdn.example.test/banner.png");
    expect(container.querySelector("[data-community-cover-art]")).toBeNull();
  });

  it("draws the look's art with the community name when there is no banner", () => {
    const canal = resolveCommunityTheme("canal");
    const { container } = render(
      <CommunityThemeCover community={{ ...base, themeId: "canal" }} />,
    );
    const cover = container.querySelector("[data-community-cover-art]");
    expect(cover).not.toBeNull();
    expect(cover!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const name = screen.getByText("MLOps Amsterdam");
    expect(cover).toContainElement(name);
    expect(name.tagName).not.toBe("H1");
    expect(name).toHaveClass("font-community-heading");
    expect(name.style.color).not.toBe("");
    expect(name).toHaveStyle({
      color: canal.cover!.nameColor,
      backgroundColor: canal.cover!.nameBase,
    });
  });

  it("renders nothing for plain without a banner", () => {
    const { container } = render(
      <CommunityThemeCover community={{ ...base, themeId: "plain" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("follows a previewed look", () => {
    function PreviewNight() {
      const { setPreviewId } = useCommunityThemePreview();
      useEffect(() => setPreviewId("night"), [setPreviewId]);
      return null;
    }
    const { container } = render(
      <CommunityThemePreviewProvider>
        <PreviewNight />
        <CommunityThemeCover community={{ ...base, themeId: "plain" }} />
      </CommunityThemePreviewProvider>,
    );
    expect(
      container.querySelector("[data-community-cover-art]"),
    ).not.toBeNull();
  });
});

describe("COMMUNITY_COVER_ART", () => {
  it("has art for exactly the looks with a cover", () => {
    for (const theme of COMMUNITY_THEMES) {
      expect(Boolean(COMMUNITY_COVER_ART[theme.id]), theme.id).toBe(
        theme.cover !== null,
      );
    }
  });

  it.each(COMMUNITY_THEMES.filter((theme) => theme.cover).map((t) => [t.id]))(
    "%s art is decorative and draws only with its own palette",
    (id) => {
      const theme = resolveCommunityTheme(id);
      const Art = COMMUNITY_COVER_ART[theme.id]!;
      const { container } = render(<Art />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("preserveAspectRatio");

      const markup = container.innerHTML;
      const used = [
        ...markup.matchAll(/var\(--community-cover-([A-Za-z]+)\)/g),
      ];
      expect(used.length).toBeGreaterThan(0);
      const palette = Object.keys(theme.cover!.palette);
      for (const [, key] of used)
        expect(palette, `${id}: ${key}`).toContain(key);
      // Every palette role is drawn, so the palette the catalog test measures
      // is the art people see. Canal's name plate is the one exception: the
      // cover paints it behind the name, outside the art.
      const drawn = new Set(used.map(([, key]) => key));
      const paintedByCover = id === "canal" ? ["namePlate"] : [];
      for (const key of palette) {
        if (paintedByCover.includes(key)) continue;
        expect(drawn.has(key), `${id}: ${key} is never drawn`).toBe(true);
      }
      // No color of its own: no hex, rgb, hsl, oklch or named color.
      expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
      expect(markup).not.toMatch(
        /(fill|stroke|stop-color|color)[=:]\s*"?(?!var\(|none|url\()[a-z]+/i,
      );
    },
  );
});

describe("CommunityCoverArt", () => {
  function paletteBox(container: HTMLElement): HTMLElement {
    const box = container.querySelector<HTMLElement>(
      "[data-community-cover-look]",
    );
    if (!box) throw new Error("no cover art box");
    return box;
  }

  it("carries its own look's palette, inside a frame of another look", () => {
    const night = resolveCommunityTheme("night");
    const { container } = render(
      <CommunityThemeScope themeId="canal">
        <CommunityCoverArt themeId="night" className="h-20" />
      </CommunityThemeScope>,
    );
    const box = paletteBox(container);
    expect(box).toHaveAttribute("data-community-cover-look", "night");
    expect(box).toHaveClass("h-20");
    expect(box).toContainElement(box.querySelector("svg"));
    for (const [role, color] of Object.entries(night.cover!.palette)) {
      expect(box.style.getPropertyValue(`--community-cover-${role}`)).toBe(
        color,
      );
    }
  });

  it("sets every role its art draws with, even where the frame sets none", () => {
    const meadow = resolveCommunityTheme("meadow");
    const { container } = render(
      <CommunityThemeScope themeId="plain">
        <CommunityCoverArt themeId="meadow" />
      </CommunityThemeScope>,
    );
    const box = paletteBox(container);
    const drawn = new Set(
      [...box.innerHTML.matchAll(/var\(--community-cover-([A-Za-z]+)\)/g)].map(
        ([, role]) => role!,
      ),
    );
    expect(drawn.size).toBeGreaterThan(0);
    for (const role of drawn) {
      expect(box.style.getPropertyValue(`--community-cover-${role}`)).toBe(
        meadow.cover!.palette[role],
      );
    }
  });

  it("renders nothing for a look without art", () => {
    const { container } = render(<CommunityCoverArt themeId="plain" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is what the community cover draws, so the cover needs no matching frame", () => {
    const sunset = resolveCommunityTheme("sunset");
    const { container } = render(
      <CommunityThemeScope themeId="night">
        <CommunityThemeCover
          community={{
            name: "MLOps",
            bannerUrl: null,
            bannerAlt: null,
            themeId: "sunset",
          }}
        />
      </CommunityThemeScope>,
    );
    // The scope shows its own look (night); the cover shows the community's.
    const box = paletteBox(container);
    expect(box).toHaveAttribute("data-community-cover-look", "sunset");
    expect(box.style.getPropertyValue("--community-cover-skyTop")).toBe(
      sunset.cover!.palette.skyTop,
    );
  });
});
