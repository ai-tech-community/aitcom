import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
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
  });

  it("keeps the house look for plain: no card, pattern, cover or face", () => {
    const scope = renderScope("plain");

    expect(scope).toHaveAttribute("data-community-theme", "plain");
    expect(scope).not.toHaveClass("dark");
    expect(scope.style.getPropertyValue("--card")).toBe("");
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
    vi.mocked(console.error).mockRestore();
  });
});

describe("CommunityThemeCover", () => {
  const base = {
    name: "MLOps Amsterdam",
    bannerUrl: null as string | null,
    bannerAlt: null as string | null,
  };

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
      // is the art people see. The name's base may instead be the plate the
      // cover paints behind the name (Canal).
      const drawn = new Set(used.map(([, key]) => key));
      for (const key of palette) {
        if (theme.cover!.palette[key] === theme.cover!.nameBase) continue;
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
