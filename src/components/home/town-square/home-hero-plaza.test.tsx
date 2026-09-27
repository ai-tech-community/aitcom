import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";

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

import { HomeHeroPlaza } from "./home-hero-plaza";
import {
  TOWN_SQUARE_STATIC_TICK,
  createTownSquare,
  type NoticeBoardContent,
} from "./town-square-scene";
import { SETTLED_GREET_MS, agentName } from "./town-square-effects";

const BOARD: NoticeBoardContent = {
  kind: "event",
  label: "Next up",
  title: "TEDAI Vienna",
  when: "Sat 10 Oct · 19:00",
};

function renderHero() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HomeHeroPlaza
        board={BOARD}
        boardLink={{
          href: "/events/tedai-vienna",
          label: "Next up: TEDAI Vienna, Sat 10 Oct · 19:00",
        }}
      >
        <h1>AI Tech Community</h1>
      </HomeHeroPlaza>
    </NextIntlClientProvider>,
  );
}

/** Give jsdom a laid-out 200×40 grid: 7.2×14px cells, copy off to the side. */
const CELL = { width: 7.2, height: 14 };
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const isScene = this.dataset.testid === "town-square-scene";
      const isProbe = this.textContent === "M".repeat(40);
      const r = isProbe
        ? { left: 0, top: 0, width: CELL.width * 40, height: CELL.height }
        : isScene
          ? {
              left: 0,
              top: 0,
              width: 200 * CELL.width,
              height: 40 * CELL.height,
            }
          : { left: 0, top: -500, width: 10, height: 10 };
      return {
        ...r,
        x: r.left,
        y: r.top,
        right: r.left + r.width,
        bottom: r.top + r.height,
        toJSON: () => r,
      } as DOMRect;
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeHeroPlaza", () => {
  it("keeps the art hidden and exposes the next event as a real link", () => {
    renderHero();
    expect(screen.getByTestId("town-square-scene")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const link = screen.getByRole("link", {
      name: "Next up: TEDAI Vienna, Sat 10 Oct · 19:00",
    });
    expect(link).toHaveAttribute("href", "/events/tedai-vienna");
    // Not placed over the board yet (jsdom has no layout): screen-reader
    // text that turns into a visible chip on keyboard focus.
    expect(link.className).toContain("sr-only");
    expect(link.className).toContain("focus-visible:not-sr-only");
  });

  it("offers no play controls when the square could not be drawn", () => {
    renderHero();
    expect(screen.queryByRole("group", { name: "Play in the square" })).toBe(
      null,
    );
  });
});

describe("HomeHeroPlaza — play", () => {
  it("offers a hidden-until-focused group of real buttons", () => {
    stubLayout();
    renderHero();
    const group = screen.getByRole("group", { name: "Play in the square" });
    expect(group.className).toContain("sr-only");
    expect(group.className).toContain("focus-within:not-sr-only");
    expect(
      screen.getByRole("button", { name: "Wave to an agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Splash the fountain" }),
    ).toBeInTheDocument();
  });

  it("toggles night with aria-pressed", () => {
    stubLayout();
    renderHero();
    const night = screen.getByRole("button", { name: "Night in the square" });
    expect(night).toHaveAttribute("aria-pressed", "false");
    act(() => night.click());
    expect(night).toHaveAttribute("aria-pressed", "true");
    const glow = () =>
      screen.getByTestId("town-square-scene").querySelectorAll("pre")[3]!
        .textContent ?? "";
    // No reduced-motion preference in jsdom: night falls over time, so
    // nothing is lit on the very first frame.
    expect(glow().trim()).toBe("");
    act(() => night.click());
    expect(night).toHaveAttribute("aria-pressed", "false");
  });

  it("announces what happened in a polite status region", () => {
    stubLayout();
    renderHero();
    act(() =>
      screen.getByRole("button", { name: "Splash the fountain" }).click(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Splash! A few people wander over to the fountain.",
    );
    act(() => screen.getByRole("button", { name: "Wave to an agent" }).click());
    expect(screen.getByRole("status").textContent).toMatch(
      /^agent-\d+ waves: “hi, I'm agent-\d+”$/,
    );
  });

  it("maps a click on the art to the agent under the pointer", () => {
    stubLayout();
    renderHero();
    const scene = createTownSquare(200, 40, {
      board: BOARD,
      greetings: en.hero.play.greetings,
    });
    // An agent with room above it for a speech bubble.
    const pick = scene.defaultTarget("agent", TOWN_SQUARE_STATIC_TICK);
    const agent = scene
      .frame(TOWN_SQUARE_STATIC_TICK)
      .figures.find((f) => pick?.kind === "agent" && f.id === pick.figureId)!;
    const art = screen.getByTestId("town-square-scene");

    fireEvent.pointerMove(art, {
      clientX: (agent.x + 1.5) * CELL.width,
      clientY: (agent.y + 0.5) * CELL.height,
    });
    expect(art.style.cursor).toBe("pointer");

    fireEvent.click(art, {
      clientX: (agent.x + 1.5) * CELL.width,
      clientY: (agent.y + 0.5) * CELL.height,
    });
    const name = agentName(agent.id);
    expect(screen.getByRole("status")).toHaveTextContent(
      `${name} waves: “hi, I'm ${name}”`,
    );
    const people = art.querySelectorAll("pre")[2]!.textContent;
    expect(people).toContain(`hi, I'm ${name}`);
  });

  it("does nothing for a click on empty sky", () => {
    stubLayout();
    renderHero();
    const art = screen.getByTestId("town-square-scene");
    fireEvent.pointerMove(art, { clientX: 1430, clientY: 5 });
    expect(art.style.cursor).toBe("");
    fireEvent.click(art, { clientX: 1430, clientY: 5 });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("applies effects instantly under reduced motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    try {
      stubLayout();
      renderHero();
      const pres = () =>
        screen.getByTestId("town-square-scene").querySelectorAll("pre");
      act(() =>
        screen.getByRole("button", { name: "Night in the square" }).click(),
      );
      // Every window is lit at once: no animation.
      expect(pres()[3]!.textContent).toContain("##");

      act(() =>
        screen.getByRole("button", { name: "Wave to an agent" }).click(),
      );
      expect(pres()[2]!.textContent).toMatch(/hi, I'm agent-\d+/);
      act(() => {
        vi.advanceTimersByTime(SETTLED_GREET_MS);
      });
      expect(pres()[2]!.textContent).not.toMatch(/hi, I'm agent-\d+/);
      // Night is a toggle, not a timed effect.
      expect(pres()[3]!.textContent).toContain("##");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
