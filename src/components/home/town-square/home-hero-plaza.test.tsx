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
function stubLayout({
  cols = 200,
  rows = 40,
  copy = null,
}: {
  cols?: number;
  rows?: number;
  /** The copy column's box; by default it sits off to the side. */
  copy?: { left: number; top: number; width: number; height: number } | null;
} = {}) {
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
              // Half a cell of slack so float maths cannot drop a column.
              width: (cols + 0.5) * CELL.width,
              height: (rows + 0.5) * CELL.height,
            }
          : (copy ?? { left: 0, top: -500, width: 10, height: 10 });
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

/** Drive animation frames by hand: each `advance()` is one scene tick. */
function manualFrames() {
  let queue: FrameRequestCallback[] = [];
  let now = 0;
  const request = vi.fn((cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const flush = () => {
    const run = queue;
    queue = [];
    now += 1000;
    act(() => {
      for (const cb of run) cb(now);
    });
  };
  // The loop's first frame only records the start time.
  return {
    request,
    flush,
    advance: (ticks = 1) => {
      for (let i = 0; i < ticks; i++) flush();
    },
  };
}

/** A reduced-motion media query whose answer can change mid-test. */
function stubReducedMotion(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) =>
      listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) =>
      listeners.delete(l),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return (matches: boolean) => {
    mql.matches = matches;
    act(() => {
      for (const l of listeners) l({ matches } as MediaQueryListEvent);
    });
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
      /^agent-\d+ waves: “hi, I'm agent-\d+”\u200b?$/,
    );
  });

  it("announces a repeated splash again", () => {
    stubLayout();
    renderHero();
    const splash = screen.getByRole("button", { name: "Splash the fountain" });
    act(() => splash.click());
    const first = screen.getByRole("status").textContent;
    act(() => splash.click());
    const second = screen.getByRole("status").textContent;
    expect(second).not.toBe(first);
    expect(second?.replace("\u200b", "")).toBe(first?.replace("\u200b", ""));
  });

  it("maps a click on the art to the agent under the pointer", () => {
    const frames = manualFrames();
    stubLayout();
    renderHero();
    const scene = createTownSquare(200, 40, {
      board: BOARD,
      greetings: en.hero.play.greetings,
    });
    // An agent with room above it for a speech bubble.
    const pick = scene.suggestTarget("agent", TOWN_SQUARE_STATIC_TICK)?.target;
    const agent = scene
      .frame(TOWN_SQUARE_STATIC_TICK)
      .figures.find((f) => pick?.kind === "agent" && f.id === pick.figureId)!;
    const art = screen.getByTestId("town-square-scene");

    fireEvent.pointerMove(art, {
      clientX: (agent.x + 1.5) * CELL.width,
      clientY: (agent.y + 0.5) * CELL.height,
    });
    frames.flush();
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
    const frames = manualFrames();
    stubLayout();
    renderHero();
    const art = screen.getByTestId("town-square-scene");
    fireEvent.pointerMove(art, { clientX: 1430, clientY: 5 });
    frames.flush();
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

  it("hit-tests the hover at most once per animation frame", () => {
    const frames = manualFrames();
    stubLayout();
    renderHero();
    const art = screen.getByTestId("town-square-scene");
    frames.flush();
    const before = frames.request.mock.calls.length;
    for (let x = 0; x < 5; x++)
      fireEvent.pointerMove(art, { clientX: 700 + x, clientY: 300 });
    // One hover frame, whatever the number of moves.
    expect(frames.request.mock.calls.length - before).toBe(1);
  });
});

describe("HomeHeroPlaza — wave with no agent in view", () => {
  it("waits for the next agent and says so, then it waves", () => {
    const frames = manualFrames();
    stubReducedMotion(false);
    stubLayout({ cols: 40, rows: 16 });
    renderHero();
    const scene = createTownSquare(40, 16, {
      board: BOARD,
      greetings: en.hero.play.greetings,
    });
    const T = TOWN_SQUARE_STATIC_TICK;
    const empty = Array.from({ length: 400 }, (_, i) => T + i).find(
      (t) => !scene.suggestTarget("agent", t),
    )!;
    expect(empty).toBeDefined();
    frames.advance(1 + (empty - T));

    const wave = screen.getByRole("button", { name: "Wave to an agent" });
    act(() => wave.click());
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toMatch(/^agent-\d+ is on the way and will wave/);

    const next = scene.suggestTarget("agent", empty, { lookahead: 600 })!;
    frames.advance(next.at - empty + 1);
    const art = screen.getByTestId("town-square-scene");
    // Front-line figures are in the people layer, back-street ones in
    // the quieter scenery layer: the waving agent is in one of them.
    const pres = art.querySelectorAll("pre");
    const both = `${pres[1]!.textContent}\n${pres[2]!.textContent}`;
    expect(both).toContain("[•]/");
  });

  it("says so kindly when there is truly nobody (reduced motion)", () => {
    stubReducedMotion(true);
    stubLayout({ cols: 18, rows: 16 });
    renderHero();
    act(() => screen.getByRole("button", { name: "Wave to an agent" }).click());
    expect(screen.getByRole("status")).toHaveTextContent(
      "No agents around right now. Try again in a moment.",
    );
  });
});

describe("HomeHeroPlaza — reduced motion switched mid-visit", () => {
  const glow = () =>
    screen.getByTestId("town-square-scene").querySelectorAll("pre")[3]!
      .textContent ?? "";
  const sky = () => screen.getByTestId("town-square-sky");

  it("keeps night as night when reduced motion is switched on", () => {
    const frames = manualFrames();
    const setReduced = stubReducedMotion(false);
    stubLayout();
    renderHero();
    frames.advance(1);
    const night = screen.getByRole("button", { name: "Night in the square" });
    act(() => night.click());
    frames.advance(5); // part-way through nightfall
    setReduced(true); // the tick jumps back to the still frame
    expect(night).toHaveAttribute("aria-pressed", "true");
    expect(glow()).toContain("##");
    expect(sky().style.opacity).toBe("1");
  });

  it("keeps night as night when reduced motion is switched off", () => {
    const frames = manualFrames();
    const setReduced = stubReducedMotion(true);
    stubLayout();
    renderHero();
    const night = screen.getByRole("button", { name: "Night in the square" });
    act(() => night.click());
    expect(sky().style.opacity).toBe("1");
    setReduced(false);
    frames.advance(3);
    expect(night).toHaveAttribute("aria-pressed", "true");
    expect(glow()).toContain("##");
    expect(sky().style.opacity).toBe("1");
    // And the next toggle starts from full night, without a flash.
    act(() => night.click());
    frames.advance(2);
    expect(Number(sky().style.opacity)).toBeGreaterThan(0.5);
  });

  it("ends a greeting instead of freezing it mid-way", () => {
    vi.useFakeTimers();
    const setReduced = stubReducedMotion(true);
    stubLayout();
    renderHero();
    act(() => screen.getByRole("button", { name: "Wave to an agent" }).click());
    const people = () =>
      screen.getByTestId("town-square-scene").querySelectorAll("pre")[2]!
        .textContent ?? "";
    expect(people()).toMatch(/hi, I'm agent-\d+/);
    setReduced(false);
    expect(people()).not.toMatch(/hi, I'm agent-\d+/);
  });
});

describe("HomeHeroPlaza — night sky", () => {
  it("never sits under the copy column", () => {
    stubReducedMotion(true);
    const copy = { left: 0, top: 0, width: 700, height: 420 };
    stubLayout({ copy });
    renderHero();
    const sky = screen.getByTestId("town-square-sky");
    expect(sky.hidden).toBe(false);
    expect(parseFloat(sky.style.left)).toBeGreaterThanOrEqual(copy.width);
    expect(sky.style.opacity).toBe("0");
    act(() =>
      screen.getByRole("button", { name: "Night in the square" }).click(),
    );
    expect(sky.style.opacity).toBe("1");
  });
});
