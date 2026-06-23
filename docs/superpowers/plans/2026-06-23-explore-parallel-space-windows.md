# Explore + Parallel Space Windows — Implementation Plan (Slice 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the primary nav `COMMUNITIES → EXPLORE`, recompose Discover into a clean two-zone card directory with web-sourced ASCII accents, and let public spaces open as multiple parallel floating `RoomView` windows.

**Architecture:** A pure window-state reducer drives a global `SpaceWindowProvider` (mounted in the locale layout). `SpaceWindowRoot` renders each open window as a reused `BuildingModal` containing the existing `RoomView`, plus a minimized-window taskbar. Realtime needs no new infra — the existing module-level singleton `useInboxStream` is mounted once whenever a window is open, so all windows share one SSE connection.

**Tech Stack:** Next.js App Router (client components), tRPC, next-intl, framer-motion (`BuildingModal`), Vitest + jsdom + @testing-library/react.

## Global Constraints

- **Branch:** work on `feat/explore-parallel-windows` (already checked out, based on `feat/ascii-discover` / PR #192 — the Discover components this plan edits exist only on that base). **Never** run `git checkout`/`switch` (subagents share the working tree).
- **Spec:** `docs/superpowers/specs/2026-06-23-explore-parallel-space-windows-design.md`.
- **Design system (CLAUDE.md / DESIGN.md / PRODUCT.md):** One Voice (Signal Orange = `text-primary`, only the single active state), No-Cream (white/true-dark bg only), House Kicker (`SectionLabel` `/ LABEL`), Mono-Is-Machine (Geist Mono for labels/stats/IDs only), Flat-By-Default (border-defined, near-flat surfaces).
- **i18n:** every user-facing string is a translation key present in **both** `messages/en.json` and `messages/nl.json`.
- **Slice 1 only:** communities navigate (no community windows); spaces open windows on desktop/tablet and **navigate** on mobile. No SSE architecture changes, no full-text search, no presence/agent badges.
- **Verification per task:** `pnpm test <file>` for the task's tests; the final task runs `pnpm typecheck` (or `pnpm exec tsc --noEmit`), `pnpm lint`, and `pnpm test`.

## File Structure

**New**
- `src/components/communities/explore/space-window-reducer.ts` — pure state + types + `windowKey` + `MAX_OPEN_BY_BREAKPOINT` (Task 2).
- `src/components/communities/explore/space-window-reducer.test.ts` — reducer unit tests (Task 2).
- `src/components/communities/explore/space-window-provider.tsx` — provider + `useSpaceWindows` hook (Task 5).
- `src/components/communities/explore/space-window-provider.test.tsx` — provider/hook tests (Task 5).
- `src/components/communities/explore/space-window-root.tsx` — renders open windows + taskbar + stream mount (Task 6).
- `src/components/communities/explore/space-window-root.test.tsx` — integration test (Task 6).
- `src/components/communities/discover/community-card.tsx` (+ `.test.tsx`) — replaces `community-row.tsx` (Task 9).
- `src/components/communities/discover/space-card.tsx` (+ `.test.tsx`) — replaces `space-row.tsx` (Task 8).
- `src/components/i18n/nav-explore.test.ts` — i18n completeness guard (Task 1).

**Modified**
- `src/components/navbar.tsx` — nav key rename (Task 1).
- `messages/en.json`, `messages/nl.json` — `nav.explore`, `communities.discover.openSpace` (Tasks 1, 8).
- `src/components/community/building-modal.tsx` — additive `onMinimize` prop (Task 3).
- `src/components/communities/rooms/room-view.tsx` — additive `fillHeight` prop (Task 4).
- `src/app/[locale]/layout.tsx` — mount provider + root (Task 7).
- `src/components/communities/discover/discover-spaces.tsx` — grid + `SpaceCard` (Task 8).
- `src/components/communities/discover/discover-communities.tsx` — grid + `CommunityCard` (Task 9).
- `src/components/communities/discover/town-square-hero.tsx`, `ascii-art.ts` — curated web ASCII (Task 10).

**Deleted**
- `src/components/communities/discover/space-row.tsx` (Task 8), `community-row.tsx` (Task 9).

**Reused as-is:** `BuildingModal` (after Task 3), `RoomView` (after Task 4), `ConversationView`, `useInboxStream`, communities/spaces tRPC routers.

---

### Task 1: Rename nav COMMUNITIES → EXPLORE

**Files:**
- Modify: `src/components/navbar.tsx:32`
- Modify: `messages/en.json` (verify `nav.explore`), `messages/nl.json` (add if missing)
- Test: `src/components/i18n/nav-explore.test.ts`

**Interfaces:**
- Produces: nav primary link `key: "explore"`, route unchanged at `/communities`.

- [ ] **Step 1: Write the failing test** — `src/components/i18n/nav-explore.test.ts`

```ts
import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

describe("nav.explore i18n", () => {
  it("exists and is non-empty in every locale", () => {
    for (const m of [en, nl] as Array<{ nav: Record<string, string> }>) {
      expect(typeof m.nav.explore).toBe("string");
      expect(m.nav.explore.trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/i18n/nav-explore.test.ts`
Expected: FAIL if `nl.json` lacks `nav.explore` (en already has `"explore": "Explore"`). If both already have it, the test passes — proceed anyway to the code change.

- [ ] **Step 3: Add the Dutch label** — in `messages/nl.json`, inside the `"nav"` object, add `"explore": "Verkennen"` (place it near the other nav keys; keep existing keys intact).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/i18n/nav-explore.test.ts`
Expected: PASS

- [ ] **Step 5: Repoint the nav label** — in `src/components/navbar.tsx`, change line 32 from:

```ts
  { href: "/communities", key: "communities", shortcut: "C", primary: true },
```

to:

```ts
  { href: "/communities", key: "explore", shortcut: "C", primary: true },
```

(The label renders via `t(link.key)`; `href` stays `/communities`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/navbar.tsx src/components/i18n/nav-explore.test.ts messages/nl.json
git commit -m "feat(explore): rename COMMUNITIES nav to EXPLORE"
```

---

### Task 2: Window-state reducer (the core logic)

**Files:**
- Create: `src/components/communities/explore/space-window-reducer.ts`
- Test: `src/components/communities/explore/space-window-reducer.test.ts`

**Interfaces:**
- Produces: `SpaceWindowRef`, `SpaceWindowState`, `initialSpaceWindowState`, `windowKey(ref)`, `MAX_OPEN_BY_BREAKPOINT`, `spaceWindowReducer(state, action)`, action type `SpaceWindowAction`.

- [ ] **Step 1: Write the failing test** — `space-window-reducer.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  spaceWindowReducer,
  initialSpaceWindowState,
  windowKey,
  type SpaceWindowRef,
} from "./space-window-reducer";

const ref = (slug: string): SpaceWindowRef => ({
  communitySlug: "acme",
  spaceSlug: slug,
  spaceName: slug.toUpperCase(),
  communityName: "ACME",
});
const keys = (list: SpaceWindowRef[]) => list.map(windowKey);

describe("spaceWindowReducer", () => {
  it("opens a window", () => {
    const s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
    expect(s.minimized).toEqual([]);
  });

  it("dedupes an already-open space (no second window)", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "open", ref: ref("a"), maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
  });

  it("auto-minimizes the oldest when exceeding maxOpen", () => {
    let s = initialSpaceWindowState;
    for (const k of ["a", "b", "c", "d"]) {
      s = spaceWindowReducer(s, { type: "open", ref: ref(k), maxOpen: 3 });
    }
    expect(keys(s.open)).toEqual(["acme/b", "acme/c", "acme/d"]);
    expect(keys(s.minimized)).toEqual(["acme/a"]);
  });

  it("minimizes and restores", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "minimize", key: "acme/a" });
    expect(s.open).toEqual([]);
    expect(keys(s.minimized)).toEqual(["acme/a"]);
    s = spaceWindowReducer(s, { type: "restore", key: "acme/a", maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
    expect(s.minimized).toEqual([]);
  });

  it("re-opening a minimized space restores it", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "minimize", key: "acme/a" });
    s = spaceWindowReducer(s, { type: "open", ref: ref("a"), maxOpen: 3 });
    expect(keys(s.open)).toEqual(["acme/a"]);
    expect(s.minimized).toEqual([]);
  });

  it("closes from open and from minimized", () => {
    let s = spaceWindowReducer(initialSpaceWindowState, { type: "open", ref: ref("a"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "open", ref: ref("b"), maxOpen: 3 });
    s = spaceWindowReducer(s, { type: "minimize", key: "acme/b" });
    s = spaceWindowReducer(s, { type: "close", key: "acme/a" });
    s = spaceWindowReducer(s, { type: "close", key: "acme/b" });
    expect(s.open).toEqual([]);
    expect(s.minimized).toEqual([]);
  });

  it("enforceMax moves overflow oldest to minimized (breakpoint shrink)", () => {
    let s = initialSpaceWindowState;
    for (const k of ["a", "b", "c"]) {
      s = spaceWindowReducer(s, { type: "open", ref: ref(k), maxOpen: 3 });
    }
    s = spaceWindowReducer(s, { type: "enforceMax", maxOpen: 1 });
    expect(keys(s.open)).toEqual(["acme/c"]);
    expect(keys(s.minimized)).toEqual(["acme/a", "acme/b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/communities/explore/space-window-reducer.test.ts`
Expected: FAIL — "Cannot find module './space-window-reducer'".

- [ ] **Step 3: Write the reducer** — `space-window-reducer.ts`

```ts
export type SpaceWindowRef = {
  communitySlug: string;
  spaceSlug: string;
  spaceName: string | null;
  communityName: string;
};

export type SpaceWindowState = {
  open: SpaceWindowRef[];
  minimized: SpaceWindowRef[];
};

export const initialSpaceWindowState: SpaceWindowState = { open: [], minimized: [] };

export const MAX_OPEN_BY_BREAKPOINT = {
  desktop: 3,
  tablet: 1,
  mobile: 0,
} as const;

export function windowKey(ref: { communitySlug: string; spaceSlug: string }): string {
  return `${ref.communitySlug}/${ref.spaceSlug}`;
}

export type SpaceWindowAction =
  | { type: "open"; ref: SpaceWindowRef; maxOpen: number }
  | { type: "minimize"; key: string }
  | { type: "restore"; key: string; maxOpen: number }
  | { type: "close"; key: string }
  | { type: "enforceMax"; maxOpen: number };

function clampOverflow(
  open: SpaceWindowRef[],
  minimized: SpaceWindowRef[],
  maxOpen: number,
): SpaceWindowState {
  if (open.length <= maxOpen) return { open, minimized };
  const overflow = open.slice(0, open.length - maxOpen);
  const kept = open.slice(open.length - maxOpen);
  return { open: kept, minimized: [...minimized, ...overflow] };
}

export function spaceWindowReducer(
  state: SpaceWindowState,
  action: SpaceWindowAction,
): SpaceWindowState {
  switch (action.type) {
    case "open": {
      const key = windowKey(action.ref);
      if (state.open.some((w) => windowKey(w) === key)) return state; // dedupe
      const minimized = state.minimized.filter((w) => windowKey(w) !== key);
      return clampOverflow([...state.open, action.ref], minimized, action.maxOpen);
    }
    case "restore": {
      const ref = state.minimized.find((w) => windowKey(w) === action.key);
      if (!ref) return state;
      const minimized = state.minimized.filter((w) => windowKey(w) !== action.key);
      return clampOverflow([...state.open, ref], minimized, action.maxOpen);
    }
    case "minimize": {
      const ref = state.open.find((w) => windowKey(w) === action.key);
      if (!ref) return state;
      return {
        open: state.open.filter((w) => windowKey(w) !== action.key),
        minimized: [...state.minimized, ref],
      };
    }
    case "close": {
      return {
        open: state.open.filter((w) => windowKey(w) !== action.key),
        minimized: state.minimized.filter((w) => windowKey(w) !== action.key),
      };
    }
    case "enforceMax": {
      return clampOverflow(state.open, state.minimized, action.maxOpen);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/communities/explore/space-window-reducer.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/explore/space-window-reducer.ts src/components/communities/explore/space-window-reducer.test.ts
git commit -m "feat(explore): pure space-window state reducer"
```

---

### Task 3: Add optional `onMinimize` to BuildingModal

**Files:**
- Modify: `src/components/community/building-modal.tsx:33-41` (props), `:83-85` (handler), `:192-198` (button)
- Test: `src/components/community/building-modal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BuildingModal` accepts optional `onMinimize?: () => void`. When provided, the minimize button calls it (provider-controlled minimize); when absent, behavior is unchanged (internal `windowState = "minimized"`).

- [ ] **Step 1: Write the failing test** — `building-modal.test.tsx`

```tsx
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

beforeAll(() => {
  // jsdom lacks matchMedia, which BuildingModal's useIsMobile needs.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
});

import { BuildingModal } from "./building-modal";

describe("BuildingModal onMinimize", () => {
  it("calls onMinimize and keeps content mounted when provided", () => {
    const onMinimize = vi.fn();
    render(
      <BuildingModal isOpen onClose={vi.fn()} title="Design" onMinimize={onMinimize}>
        <div>room-body</div>
      </BuildingModal>,
    );
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(screen.getByText("room-body")).toBeInTheDocument(); // not internally minimized
  });

  it("falls back to internal minimize when onMinimize is absent", () => {
    render(
      <BuildingModal isOpen onClose={vi.fn()} title="Design">
        <div>room-body</div>
      </BuildingModal>,
    );
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(screen.queryByText("room-body")).not.toBeInTheDocument(); // content hidden
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/community/building-modal.test.tsx`
Expected: FAIL — first test fails because the minimize button currently always toggles internal state (`room-body` disappears) and `onMinimize` is not a prop.

- [ ] **Step 3: Implement the prop**

In `src/components/community/building-modal.tsx`, add to `BuildingModalProps` (after `windowIndex?`):

```ts
  /** When provided, the minimize button calls this instead of toggling internal minimize state. */
  onMinimize?: () => void;
```

Add `onMinimize` to the destructured params (alongside `windowIndex = 0`).

After the existing `toggleMinimize` definition, add:

```ts
  const handleMinimizeClick = useCallback(() => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    toggleMinimize();
  }, [onMinimize, toggleMinimize]);
```

Change the minimize button's `onClick={toggleMinimize}` to `onClick={handleMinimizeClick}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/community/building-modal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/community/building-modal.tsx src/components/community/building-modal.test.tsx
git commit -m "feat(explore): add optional onMinimize hook to BuildingModal"
```

---

### Task 4: Add `fillHeight` to RoomView

**Files:**
- Modify: `src/components/communities/rooms/room-view.tsx:15-21` (props), `:53` (container class)
- Test: `src/components/communities/rooms/room-view.test.tsx`

**Interfaces:**
- Produces: `RoomView` accepts optional `fillHeight?: boolean`. `true` → active-chat container is `h-full min-h-0` (fills a window); default/`false` → existing `h-[calc(100vh-16rem)] min-h-96` (page behavior, unchanged).

- [ ] **Step 1: Write the failing test** — `room-view.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const ACTIVE_ROOM = {
  id: "s1", name: "Design", purpose: null, visibility: "public",
  membership: "active", conversationId: "c1", memberCount: 0,
  memberAvatars: [], viewerIsAdmin: false,
};

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ spaces: { getRoom: { invalidate: vi.fn() } } }),
    spaces: {
      getRoom: { useQuery: vi.fn(() => ({ data: ACTIVE_ROOM, isLoading: false, isError: false, refetch: vi.fn() })) },
      joinRoom: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      requestAccess: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/messages/conversation-view", () => ({ ConversationView: () => <div data-testid="cv" /> }));
vi.mock("./room-members-panel", () => ({ RoomMembersPanel: () => <div /> }));

import { RoomView } from "./room-view";

describe("RoomView fillHeight", () => {
  it("uses h-full when fillHeight is set", () => {
    const { container } = render(<RoomView slug="acme" spaceSlug="design" fillHeight />);
    expect((container.firstElementChild as HTMLElement).className).toContain("h-full");
  });

  it("uses the page calc height by default", () => {
    const { container } = render(<RoomView slug="acme" spaceSlug="design" />);
    expect((container.firstElementChild as HTMLElement).className).toContain("min-h-96");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/communities/rooms/room-view.test.tsx`
Expected: FAIL — `fillHeight` is not a prop; first test's container has `min-h-96`, not `h-full`.

- [ ] **Step 3: Implement the prop**

Change the signature:

```tsx
export function RoomView({
  slug,
  spaceSlug,
  fillHeight = false,
}: {
  slug: string;
  spaceSlug: string;
  fillHeight?: boolean;
}) {
```

Change the active-branch container (currently `<div className="flex h-[calc(100vh-16rem)] min-h-96 flex-col">`) to:

```tsx
      <div
        className={
          fillHeight
            ? "flex h-full min-h-0 flex-col"
            : "flex h-[calc(100vh-16rem)] min-h-96 flex-col"
        }
      >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/communities/rooms/room-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/rooms/room-view.tsx src/components/communities/rooms/room-view.test.tsx
git commit -m "feat(explore): add fillHeight prop to RoomView for window embedding"
```

---

### Task 5: SpaceWindowProvider + useSpaceWindows hook

**Files:**
- Create: `src/components/communities/explore/space-window-provider.tsx`
- Test: `src/components/communities/explore/space-window-provider.test.tsx`

**Interfaces:**
- Consumes: `spaceWindowReducer`, `initialSpaceWindowState`, `windowKey`, `MAX_OPEN_BY_BREAKPOINT`, `SpaceWindowRef` (Task 2); `useRouter` from `@/i18n/navigation`.
- Produces: `<SpaceWindowProvider>` and `useSpaceWindows(): { open, minimized, openSpace(ref), closeSpace(key), minimizeSpace(key), restoreSpace(key) }`. On the mobile breakpoint, `openSpace` navigates to `/communities/[slug]/spaces/[spaceSlug]` instead of opening a window.

- [ ] **Step 1: Write the failing test** — `space-window-provider.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { SpaceWindowProvider, useSpaceWindows } from "./space-window-provider";

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: w });
}
const ref = (slug: string) => ({
  communitySlug: "acme", spaceSlug: slug, spaceName: slug, communityName: "ACME",
});
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SpaceWindowProvider>{children}</SpaceWindowProvider>
);

beforeEach(() => {
  pushMock.mockReset();
  setWidth(1280); // desktop
});

describe("useSpaceWindows", () => {
  it("opens, dedupes, and caps to 3 on desktop (oldest minimized)", () => {
    const { result } = renderHook(() => useSpaceWindows(), { wrapper });
    act(() => result.current.openSpace(ref("a")));
    act(() => result.current.openSpace(ref("a"))); // dedupe
    expect(result.current.open).toHaveLength(1);
    act(() => result.current.openSpace(ref("b")));
    act(() => result.current.openSpace(ref("c")));
    act(() => result.current.openSpace(ref("d")));
    expect(result.current.open.map((w) => w.spaceSlug)).toEqual(["b", "c", "d"]);
    expect(result.current.minimized.map((w) => w.spaceSlug)).toEqual(["a"]);
  });

  it("minimizes and restores", () => {
    const { result } = renderHook(() => useSpaceWindows(), { wrapper });
    act(() => result.current.openSpace(ref("a")));
    act(() => result.current.minimizeSpace("acme/a"));
    expect(result.current.open).toHaveLength(0);
    expect(result.current.minimized).toHaveLength(1);
    act(() => result.current.restoreSpace("acme/a"));
    expect(result.current.open).toHaveLength(1);
  });

  it("navigates instead of opening a window on mobile", () => {
    setWidth(500);
    const { result } = renderHook(() => useSpaceWindows(), { wrapper });
    act(() => result.current.openSpace(ref("a")));
    expect(result.current.open).toHaveLength(0);
    expect(pushMock).toHaveBeenCalledWith("/communities/acme/spaces/a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/communities/explore/space-window-provider.test.tsx`
Expected: FAIL — "Cannot find module './space-window-provider'".

- [ ] **Step 3: Write the provider** — `space-window-provider.tsx`

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@/i18n/navigation";
import {
  spaceWindowReducer,
  initialSpaceWindowState,
  MAX_OPEN_BY_BREAKPOINT,
  type SpaceWindowRef,
  type SpaceWindowState,
} from "./space-window-reducer";

type Breakpoint = "desktop" | "tablet" | "mobile";

const DESKTOP_MIN = 1024;
const TABLET_MIN = 768;

function getBreakpoint(width: number): Breakpoint {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width >= TABLET_MIN) return "tablet";
  return "mobile";
}

function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  useEffect(() => {
    const handleResize = () => setBreakpoint(getBreakpoint(window.innerWidth));
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return breakpoint;
}

type SpaceWindowContextValue = SpaceWindowState & {
  openSpace: (ref: SpaceWindowRef) => void;
  closeSpace: (key: string) => void;
  minimizeSpace: (key: string) => void;
  restoreSpace: (key: string) => void;
};

const SpaceWindowContext = createContext<SpaceWindowContextValue | null>(null);

export function SpaceWindowProvider({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const router = useRouter();
  const [state, dispatch] = useReducer(spaceWindowReducer, initialSpaceWindowState);
  const maxOpen = MAX_OPEN_BY_BREAKPOINT[breakpoint];

  // When the viewport shrinks, push overflow windows into the taskbar.
  useEffect(() => {
    dispatch({ type: "enforceMax", maxOpen });
  }, [maxOpen]);

  const openSpace = useCallback(
    (ref: SpaceWindowRef) => {
      if (breakpoint === "mobile") {
        router.push(`/communities/${ref.communitySlug}/spaces/${ref.spaceSlug}`);
        return;
      }
      dispatch({ type: "open", ref, maxOpen: MAX_OPEN_BY_BREAKPOINT[breakpoint] });
    },
    [breakpoint, router],
  );

  const closeSpace = useCallback((key: string) => dispatch({ type: "close", key }), []);
  const minimizeSpace = useCallback((key: string) => dispatch({ type: "minimize", key }), []);
  const restoreSpace = useCallback(
    (key: string) => dispatch({ type: "restore", key, maxOpen: MAX_OPEN_BY_BREAKPOINT[breakpoint] }),
    [breakpoint],
  );

  const value: SpaceWindowContextValue = {
    ...state,
    openSpace,
    closeSpace,
    minimizeSpace,
    restoreSpace,
  };

  return (
    <SpaceWindowContext.Provider value={value}>{children}</SpaceWindowContext.Provider>
  );
}

export function useSpaceWindows(): SpaceWindowContextValue {
  const ctx = useContext(SpaceWindowContext);
  if (!ctx) throw new Error("useSpaceWindows must be used within a <SpaceWindowProvider>");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/communities/explore/space-window-provider.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/explore/space-window-provider.tsx src/components/communities/explore/space-window-provider.test.tsx
git commit -m "feat(explore): SpaceWindowProvider with breakpoint-aware open/minimize"
```

---

### Task 6: SpaceWindowRoot (render windows + taskbar + shared stream)

**Files:**
- Create: `src/components/communities/explore/space-window-root.tsx`
- Test: `src/components/communities/explore/space-window-root.test.tsx`

**Interfaces:**
- Consumes: `useSpaceWindows`, `windowKey` (Tasks 2/5); `BuildingModal` (Task 3, `onMinimize`); `RoomView` (Task 4, `fillHeight`); `useInboxStream`; `authClient`.
- Produces: `<SpaceWindowRoot />` — renders one `BuildingModal` per open window (title = space name, `windowIndex` = position, `onClose`/`onMinimize` wired), a minimized taskbar of restore buttons, and mounts the singleton `useInboxStream` whenever ≥1 window is open. Renders nothing when signed out.

- [ ] **Step 1: Write the failing test** — `space-window-root.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/inbox/use-inbox-stream", () => ({ useInboxStream: vi.fn() }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u" } } }) },
}));
vi.mock("@/components/communities/rooms/room-view", () => ({
  RoomView: ({ spaceSlug }: { spaceSlug: string }) => <div data-testid="roomview">{spaceSlug}</div>,
}));
vi.mock("@/components/community/building-modal", () => ({
  BuildingModal: ({ title, children, onClose, onMinimize }: {
    title: string; children: React.ReactNode; onClose: () => void; onMinimize?: () => void;
  }) => (
    <div data-testid="window">
      <span data-testid="window-title">{title}</span>
      <button onClick={onMinimize}>min</button>
      <button onClick={onClose}>close</button>
      {children}
    </div>
  ),
}));

import { SpaceWindowProvider, useSpaceWindows } from "./space-window-provider";
import { SpaceWindowRoot } from "./space-window-root";

function Harness() {
  const { openSpace } = useSpaceWindows();
  return (
    <button
      onClick={() =>
        openSpace({ communitySlug: "acme", spaceSlug: "design", spaceName: "Design", communityName: "ACME" })
      }
    >
      open
    </button>
  );
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
});

describe("SpaceWindowRoot", () => {
  it("opens exactly one window with the space name and RoomView", () => {
    render(
      <SpaceWindowProvider>
        <Harness />
        <SpaceWindowRoot />
      </SpaceWindowProvider>,
    );
    expect(screen.queryByTestId("window")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getAllByTestId("window")).toHaveLength(1);
    expect(screen.getByTestId("window-title")).toHaveTextContent("Design");
    expect(screen.getByTestId("roomview")).toHaveTextContent("design");
  });

  it("minimizes to a taskbar restore button and restores", () => {
    render(
      <SpaceWindowProvider>
        <Harness />
        <SpaceWindowRoot />
      </SpaceWindowProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("min"));
    expect(screen.queryByTestId("window")).not.toBeInTheDocument();
    const restore = screen.getByRole("button", { name: /Design/ });
    fireEvent.click(restore);
    expect(screen.getByTestId("window")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/communities/explore/space-window-root.test.tsx`
Expected: FAIL — "Cannot find module './space-window-root'".

- [ ] **Step 3: Write the component** — `space-window-root.tsx`

```tsx
"use client";

import { Terminal } from "lucide-react";
import { authClient } from "@/server/better-auth/client";
import { BuildingModal } from "@/components/community/building-modal";
import { RoomView } from "@/components/communities/rooms/room-view";
import { useInboxStream } from "@/components/inbox/use-inbox-stream";
import { useSpaceWindows } from "./space-window-provider";
import { windowKey } from "./space-window-reducer";

// Mounted only while a window is open; relies on the module-level singleton in
// useInboxStream so all windows (and the inbox) share ONE EventSource.
function SpaceWindowStream() {
  useInboxStream();
  return null;
}

export function SpaceWindowRoot() {
  const { open, minimized, closeSpace, minimizeSpace, restoreSpace } = useSpaceWindows();
  const { data: session } = authClient.useSession();

  if (!session?.user) return null;

  return (
    <>
      {open.length > 0 && <SpaceWindowStream />}

      {open.map((ref, i) => {
        const key = windowKey(ref);
        return (
          <BuildingModal
            key={key}
            isOpen
            title={ref.spaceName ?? ref.spaceSlug}
            windowIndex={i}
            onClose={() => closeSpace(key)}
            onMinimize={() => minimizeSpace(key)}
          >
            <RoomView slug={ref.communitySlug} spaceSlug={ref.spaceSlug} fillHeight />
          </BuildingModal>
        );
      })}

      {minimized.length > 0 && (
        <div className="fixed bottom-3 left-3 z-40 flex flex-wrap items-end gap-2 sm:bottom-4 sm:left-4">
          {minimized.map((ref) => {
            const key = windowKey(ref);
            const label = ref.spaceName ?? ref.spaceSlug;
            return (
              <button
                key={key}
                type="button"
                onClick={() => restoreSpace(key)}
                className="border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-t-lg border px-3 py-2 font-mono text-xs tracking-wider transition-colors"
                title={`Restore ${label}`}
              >
                <Terminal aria-hidden className="size-3.5" />
                <span className="max-w-32 truncate">{label.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/communities/explore/space-window-root.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/explore/space-window-root.tsx src/components/communities/explore/space-window-root.test.tsx
git commit -m "feat(explore): SpaceWindowRoot renders windows, taskbar, shared SSE"
```

---

### Task 7: Mount provider + root in the locale layout

**Files:**
- Modify: `src/app/[locale]/layout.tsx:13-14` (imports), `:79-85` (tree)

**Interfaces:**
- Consumes: `SpaceWindowProvider`, `SpaceWindowRoot`.
- Produces: both available app-wide; `SpaceWindowRoot` sits alongside `InboxRoot`.

- [ ] **Step 1: Add imports** — after the existing inbox imports (lines 13-14):

```tsx
import { SpaceWindowProvider } from "@/components/communities/explore/space-window-provider";
import { SpaceWindowRoot } from "@/components/communities/explore/space-window-root";
```

- [ ] **Step 2: Wrap the inbox subtree** — change the `<InboxProvider>` block to nest `SpaceWindowProvider` inside it and render `SpaceWindowRoot` next to `InboxRoot`:

```tsx
                  <InboxProvider>
                    <SpaceWindowProvider>
                      <main className="to-background flex-1 bg-linear-to-b from-orange-50/60 via-amber-50/30">
                        {children}
                      </main>
                      <Footer />
                      <InboxRoot />
                      <SpaceWindowRoot />
                    </SpaceWindowProvider>
                  </InboxProvider>
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/layout.tsx
git commit -m "feat(explore): mount SpaceWindowProvider and root in layout"
```

---

### Task 8: Space card (row → card) + open-window trigger + spaces grid

**Files:**
- Create: `src/components/communities/discover/space-card.tsx`, `space-card.test.tsx`
- Delete: `src/components/communities/discover/space-row.tsx`
- Modify: `src/components/communities/discover/discover-spaces.tsx:9` (import), `:59-64` (grid)
- Modify: `messages/en.json`, `messages/nl.json` (`communities.discover.openSpace`)

**Interfaces:**
- Consumes: `useSpaceWindows().openSpace` (Task 5).
- Produces: `SpaceCard` (same props as the old `SpaceRow`: `spaceName`, `spaceSlug`, `communityName`, `communitySlug`, `memberCount`) — a button that calls `openSpace`.

- [ ] **Step 1: Add the i18n key** — in `messages/en.json` under `communities.discover`, add `"openSpace": "Open {space}"`. In `messages/nl.json` under the same path, add `"openSpace": "Open {space}"`.

- [ ] **Step 2: Write the failing test** — `space-card.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { openSpace } = vi.hoisted(() => ({ openSpace: vi.fn() }));
vi.mock("@/components/communities/explore/space-window-provider", () => ({
  useSpaceWindows: () => ({ openSpace }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));

import { SpaceCard } from "./space-card";

describe("SpaceCard", () => {
  it("opens the space window on click with the full ref", () => {
    render(
      <SpaceCard spaceName="Design" spaceSlug="design" communityName="ACME" communitySlug="acme" memberCount={4} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(openSpace).toHaveBeenCalledWith({
      communitySlug: "acme",
      spaceSlug: "design",
      spaceName: "Design",
      communityName: "ACME",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/components/communities/discover/space-card.test.tsx`
Expected: FAIL — "Cannot find module './space-card'".

- [ ] **Step 4: Write the card** — `space-card.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { useSpaceWindows } from "@/components/communities/explore/space-window-provider";

export function SpaceCard({
  spaceName,
  spaceSlug,
  communityName,
  communitySlug,
  memberCount,
}: {
  spaceName: string | null;
  spaceSlug: string;
  communityName: string;
  communitySlug: string;
  memberCount: number;
}) {
  const t = useTranslations("communities.discover");
  const { openSpace } = useSpaceWindows();
  const label = spaceName ?? t("roomFallback");
  return (
    <button
      type="button"
      onClick={() => openSpace({ communitySlug, spaceSlug, spaceName, communityName })}
      aria-label={t("openSpace", { space: label })}
      className="border-border hover:border-foreground/30 hover:bg-muted/40 flex h-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors"
    >
      <div className="flex items-center gap-3">
        <SpaceAvatar name={spaceName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">#{label}</p>
          <p className="text-muted-foreground truncate text-xs">
            {t("inCommunity", { community: communityName })}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center">
        <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-xs">
          <Users aria-hidden="true" className="size-3.5" />
          {memberCount}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/components/communities/discover/space-card.test.tsx`
Expected: PASS.

- [ ] **Step 6: Swap the list for a grid in `discover-spaces.tsx`** — change the import on line 9 from `import { SpaceRow } from "./space-row";` to `import { SpaceCard } from "./space-card";`. Replace the populated `<ul>...</ul>` block (the one mapping `SpaceRow`, ~lines 59-64) with:

```tsx
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <SpaceCard
            key={s.spaceId}
            spaceName={s.spaceName}
            spaceSlug={s.spaceSlug}
            communityName={s.communityName}
            communitySlug={s.communitySlug}
            memberCount={s.memberCount}
          />
        ))}
      </div>
```

(Leave the loading skeleton and empty-state blocks unchanged.)

- [ ] **Step 7: Delete the old row**

```bash
git rm src/components/communities/discover/space-row.tsx
```

- [ ] **Step 8: Verify typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm test src/components/communities/discover/space-card.test.tsx`
Expected: no type errors (confirms nothing else imports `space-row`); test PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/communities/discover/space-card.tsx src/components/communities/discover/space-card.test.tsx src/components/communities/discover/discover-spaces.tsx messages/en.json messages/nl.json
git commit -m "feat(explore): space cards open parallel RoomView windows"
```

---

### Task 9: Community card (row → card, navigates) + communities grid

**Files:**
- Create: `src/components/communities/discover/community-card.tsx`, `community-card.test.tsx`
- Delete: `src/components/communities/discover/community-row.tsx`
- Modify: `src/components/communities/discover/discover-communities.tsx` (import + grid)

**Interfaces:**
- Produces: `CommunityCard` (same props as the old `CommunityRow`: `slug`, `name`, `description`, `logoUrl`, `memberCount`, `faces`) — a `Link` to `/communities/[slug]`.

- [ ] **Step 1: Write the failing test** — `community-card.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/trpc/react", () => ({ api: {} })); // MemberStackView's module pulls trpc; keep it off the server
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
vi.mock("@/components/communities/member-stack", () => ({ MemberStackView: () => <div /> }));

import { CommunityCard } from "./community-card";

describe("CommunityCard", () => {
  it("links to the community page", () => {
    render(
      <CommunityCard slug="acme" name="ACME" description="Builders" logoUrl={null} memberCount={12} faces={[]} />,
    );
    const link = screen.getByRole("link", { name: /ACME/ });
    expect(link).toHaveAttribute("href", "/communities/acme");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/communities/discover/community-card.test.tsx`
Expected: FAIL — "Cannot find module './community-card'".

- [ ] **Step 3: Write the card** — `community-card.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";
import { type StackFace } from "@/server/communities/member-stack";
import { MemberStackView } from "@/components/communities/member-stack";

export function CommunityCard({
  slug,
  name,
  description,
  logoUrl,
  memberCount,
  faces,
}: {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  faces: StackFace[];
}) {
  const t = useTranslations("communities.discover");
  return (
    <Link
      href={`/communities/${slug}`}
      className="border-border hover:border-foreground/30 hover:bg-muted/40 flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <Avatar size="sm" className="rounded-md">
            <AvatarImage src={logoUrl} alt="" />
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        ) : (
          <SpaceAvatar name={name} />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</p>
      </div>
      {description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm">{description}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between">
        <MemberStackView faces={faces} total={memberCount} />
        <span className="text-muted-foreground font-mono text-xs">
          {t("membersCount", { count: memberCount })}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/communities/discover/community-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Swap the list for a grid in `discover-communities.tsx`** — change the `CommunityRow` import to `import { CommunityCard } from "./community-card";`. Find the populated container that maps `CommunityRow` inside a `<ul className="...divide-y...">` and replace it with a grid, preserving the existing facet/search/empty/loading logic and the exact props passed to each item:

```tsx
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CommunityCard
            key={c.slug}
            slug={c.slug}
            name={c.name}
            description={c.description}
            logoUrl={c.logoUrl}
            memberCount={c.memberCount}
            faces={c.faces}
          />
        ))}
      </div>
```

(If the local variable name for the mapped array or item fields differs, keep the file's existing names — only the wrapper element and component change from `<ul>`/`CommunityRow` to grid/`CommunityCard`.)

- [ ] **Step 6: Delete the old row**

```bash
git rm src/components/communities/discover/community-row.tsx
```

- [ ] **Step 7: Verify typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm test src/components/communities/discover/community-card.test.tsx`
Expected: no type errors (confirms nothing else imports `community-row`); test PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/communities/discover/community-card.tsx src/components/communities/discover/community-card.test.tsx src/components/communities/discover/discover-communities.tsx
git commit -m "feat(explore): community cards in a responsive grid"
```

---

### Task 10: Replace hand-made ASCII with curated web art

**Files:**
- Modify: `src/components/communities/discover/ascii-art.ts`
- Modify: `src/components/communities/discover/town-square-hero.tsx` (if banner sizing/markup needs adjusting)

**Interfaces:**
- Produces: legible `TOWN_SQUARE_BANNER` and `QUIET_SQUARE` constants (same export names so consumers are untouched), each annotated with its source URL.

- [ ] **Step 1: Source candidates from the web** — use WebSearch/WebFetch to find freely-usable (public-domain / permissive) ASCII art matching the Explore motif: a small banner (town square / community / terminal) for the hero and a quiet/empty notice-board figure for the empty state. Prefer recognized archives (e.g. asciiart.eu). Capture each piece's source URL.

- [ ] **Step 2: Replace the constants** — in `ascii-art.ts`, replace `TOWN_SQUARE_BANNER` and `QUIET_SQUARE` with the curated art, keeping the existing `export const` names. Above each, add a comment with its source URL, e.g. `// source: https://...`. Keep line widths modest so they render without horizontal scroll at the hero/empty-state sizes already used.

- [ ] **Step 3: Human-eye legibility check** — render the page (`pnpm dev`, open `/communities`) and confirm each figure reads as intended (the prior banner once mis-read as a cat — verify it does not). Adjust sizing classes in `town-square-hero.tsx` only if needed.

- [ ] **Step 4: Verify typecheck + existing tests**

Run: `pnpm exec tsc --noEmit && pnpm test src/components/communities`
Expected: no errors; existing discover/component tests pass (constants are plain strings).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/discover/ascii-art.ts src/components/communities/discover/town-square-hero.tsx
git commit -m "feat(explore): curated web-sourced ASCII accents"
```

---

### Task 11: Impeccable polish + full verification

**Files:**
- Touch as needed: `space-window-root.tsx` (taskbar pill, window chrome), `space-card.tsx`, `community-card.tsx`, `discover-spaces.tsx`, `discover-communities.tsx`.

- [ ] **Step 1: Run the impeccable lens** — invoke the `impeccable` skill against the Explore page (cards grid, hero), the `BuildingModal` window chrome hosting `RoomView`, and the minimized taskbar pill. Enforce: One Voice (Signal Orange only on the single active state — verify cards/pills don't introduce stray orange), No-Cream, House Kicker (`SectionLabel`), Mono-Is-Machine (member counts/labels in mono), Flat-By-Default. Apply only the focused fixes it surfaces.

- [ ] **Step 2: Manual cross-window smoke** — with chat enabled locally, open 3+ space windows from Explore, confirm: dedupe (re-click focuses, no duplicate), 4th auto-minimizes oldest to the taskbar, restore works, drag/resize/maximize work, and a message sent in one window updates that window live (shared SSE). Confirm mobile width navigates to the space page instead of opening a window.

- [ ] **Step 3: Full verification**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm lint`
Expected: clean.

Run: `pnpm test`
Expected: all non-DB suites pass (DB-gated integration suites remain skipped unless `RUN_DB_TESTS=1` with a local Postgres).

- [ ] **Step 4: Commit any polish**

```bash
git add -A
git commit -m "polish(explore): impeccable pass on cards, window chrome, taskbar"
```

---

## Self-Review

**Spec coverage:**
- Nav rename → Task 1. ✓
- Two-zone card directory (communities + spaces) → Tasks 8, 9. ✓
- Web-sourced ASCII accents → Task 10. ✓
- Space opens full `RoomView` in a `BuildingModal` window → Tasks 4, 6. ✓
- Multiple parallel windows, dedupe, focus, minimize/restore, close, overflow→minimize → Tasks 2, 5, 6. ✓
- Minimized taskbar → Task 6. ✓
- Shared singleton SSE across windows → Task 6 (`SpaceWindowStream`). ✓
- Capacity (3 desktop / 1 tablet / 0 mobile) + mobile navigates → Tasks 2, 5. ✓
- Membership gating handled inside `RoomView` (no new logic) → reused as-is. ✓
- Global mount → Task 7. ✓
- Testing (reducer, provider, smoke, cards) → Tasks 2, 5, 6, 8, 9. ✓
- Design-system / impeccable → Task 11. ✓

**Placeholder scan:** none — every code step has complete code; no TBD/TODO.

**Type consistency:** `SpaceWindowRef` `{ communitySlug, spaceSlug, spaceName, communityName }`, `windowKey`, action shapes, `MAX_OPEN_BY_BREAKPOINT`, and the `useSpaceWindows` surface (`open`, `minimized`, `openSpace`, `closeSpace`, `minimizeSpace`, `restoreSpace`) are used identically across Tasks 2/5/6/8. `BuildingModal.onMinimize` (Task 3) and `RoomView.fillHeight` (Task 4) match their consumers in Task 6. `SpaceCard`/`CommunityCard` props match the deleted rows' props and the tRPC item fields used in the discover containers.

**Resolved spec "confirm" items:** `spaces.discoverPublic` returns `communitySlug` + `spaceSlug` (already passed to `SpaceRow`) → cards have everything. `RoomView` does not mount `useInboxStream` → mounted in `SpaceWindowRoot`.
