import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type * as TownSquareSceneModule from "@/components/home/town-square/town-square-scene";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Wrap the real scene builder so a test can count how often it runs.
vi.mock(
  "@/components/home/town-square/town-square-scene",
  async (importOriginal) => {
    const real = await importOriginal<typeof TownSquareSceneModule>();
    return { ...real, createTownSquare: vi.fn(real.createTownSquare) };
  },
);

import { HomeClosingSquare } from "./home-closing-square";
import {
  CLOSING_SQUARE_STATIC_TICK,
  createClosingSquareFrame,
} from "./closing-square-frame";
import { CREATE_COMMUNITY_HREF } from "@/components/communities/create-community-link";
import { createTownSquare } from "@/components/home/town-square/town-square-scene";

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

let raf: ReturnType<typeof vi.fn>;
beforeEach(() => {
  raf = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderIn(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <HomeClosingSquare />
    </NextIntlClientProvider>,
  );
}

describe("createClosingSquareFrame", () => {
  const COLS = 160;
  const ROWS = 20;

  it("draws the square without a notice board, so nothing is orange", () => {
    const layers = createClosingSquareFrame()(
      CLOSING_SQUARE_STATIC_TICK,
      COLS,
      ROWS,
    );
    expect(Object.keys(layers).sort()).toEqual(
      ["far", "glow", "people", "scenery", "accent"].sort(),
    );
    // The strip never paints the accent layer (and does not render it).
    expect((layers as Record<string, string[]>).accent!.join("").trim()).toBe(
      "",
    );
    expect(layers.scenery.join("")).not.toContain("NEXT UP");
  });

  it("is evening: lights are on from the first frame", () => {
    const layers = createClosingSquareFrame()(
      CLOSING_SQUARE_STATIC_TICK,
      COLS,
      ROWS,
    );
    expect(layers.glow.join("").trim().length).toBeGreaterThan(0);
  });

  it("builds the square once per grid size", () => {
    const build = vi.mocked(createTownSquare);
    build.mockClear();
    const frame = createClosingSquareFrame();
    frame(1, COLS, ROWS);
    frame(2, COLS, ROWS);
    frame(3, COLS, ROWS);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith(
      COLS,
      ROWS,
      expect.objectContaining({ board: null }),
    );
    expect(frame(4, COLS - 10, ROWS).scenery[0]!.length).toBe(COLS - 10);
    expect(build).toHaveBeenCalledTimes(2);
  });
});

describe("HomeClosingSquare", () => {
  it("ends on the hero's two equal actions, as Ink buttons", () => {
    stubReducedMotion(false);
    renderIn();
    const explore = screen.getByRole("link", { name: en.hero.cta });
    const host = screen.getByRole("link", { name: en.hero.host });
    expect(explore).toHaveAttribute("href", "/communities");
    expect(host).toHaveAttribute("href", CREATE_COMMUNITY_HREF);
    for (const link of [explore, host]) {
      expect(link).toHaveAttribute("data-variant", "ink");
      expect(link).toHaveAttribute("data-size", "lg");
    }
    expect(
      screen.getByRole("heading", { level: 2, name: en.homeClosing.title }),
    ).toBeInTheDocument();
  });

  it("keeps the square decorative and free of orange", () => {
    stubReducedMotion(false);
    renderIn();
    const scene = screen.getByTestId("closing-square-scene");
    expect(scene).toHaveAttribute("aria-hidden", "true");
    expect(scene.innerHTML).not.toMatch(/text-primary|bg-primary/);
  });

  it("holds still under reduced motion", () => {
    stubReducedMotion(true);
    renderIn();
    expect(raf).not.toHaveBeenCalled();
  });

  it("animates only when motion is allowed", () => {
    stubReducedMotion(false);
    renderIn();
    expect(raf).toHaveBeenCalled();
  });

  it("speaks Dutch on /nl", () => {
    stubReducedMotion(true);
    renderIn("nl");
    expect(
      screen.getByRole("heading", { name: nl.homeClosing.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: nl.hero.host })).toBeTruthy();
  });
});
