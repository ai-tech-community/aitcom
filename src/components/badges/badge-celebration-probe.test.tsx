import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UnseenEarnings } from "@/server/badges/earning-moment";

/**
 * A stand-in for the query cache: once fetched, the answer stays visible
 * to every mount until `setData` replaces it, like react-query with
 * `staleTime: Infinity`.
 */
const calls = vi.hoisted(() => ({
  options: [] as { enabled?: boolean; staleTime?: number }[],
  fetches: 0,
  server: undefined as UnseenEarnings | undefined,
  cache: undefined as UnseenEarnings | undefined,
  dialogRenders: 0,
  pathname: "/",
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      badges: {
        unseen: {
          setData: (_input: unknown, data: UnseenEarnings) => {
            calls.cache = data;
          },
        },
      },
    }),
    badges: {
      unseen: {
        useQuery: (
          _input: unknown,
          opts: { enabled?: boolean; staleTime?: number },
        ) => {
          calls.options.push(opts);
          if (opts.enabled && calls.cache === undefined) {
            calls.fetches += 1;
            calls.cache = calls.server;
          }
          return { data: calls.cache, isError: false };
        },
      },
    },
  },
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => calls.pathname,
}));

// next/dynamic fetches a component's code only when it first renders, so a
// render of the stand-in is the dialog module being loaded.
vi.mock("next/dynamic", () => ({
  default: () =>
    function LazyDialog({ onDone }: { onDone: () => void }) {
      calls.dialogRenders += 1;
      return (
        <div role="dialog" aria-label="celebration">
          <button type="button" onClick={onDone}>
            Done
          </button>
        </div>
      );
    },
}));

import {
  BadgeCelebrationProbe,
  isEditingElement,
} from "./badge-celebration-probe";

const SOME: UnseenEarnings = {
  items: [
    {
      kind: "badge",
      id: "b1",
      slug: "article_author",
      earnedAt: "2026-06-02T12:00:00.000Z",
      rarity: null,
    },
  ],
  moreIds: [],
  profile: { pins: [], reach: { kind: "public" } },
};

async function idle(ms = 1000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  calls.options = [];
  calls.fetches = 0;
  calls.server = undefined;
  calls.cache = undefined;
  calls.dialogRenders = 0;
  calls.pathname = "/";
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("BadgeCelebrationProbe", () => {
  it("asks only after first paint, once, and then shows the dialog", async () => {
    calls.server = SOME;
    render(<BadgeCelebrationProbe userId="u1" />);
    expect(calls.options.at(-1)?.enabled).toBe(false);
    expect(calls.fetches).toBe(0);

    await idle();
    expect(calls.fetches).toBe(1);
    expect(calls.options.find((o) => o.enabled)).toMatchObject({
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Open: it stops asking.
    expect(calls.options.at(-1)?.enabled).toBe(false);
  });

  it("never loads the dialog when there is nothing unseen", async () => {
    calls.server = { items: [], moreIds: [], profile: null };
    render(<BadgeCelebrationProbe userId="u1" />);
    await idle();
    expect(calls.fetches).toBe(1);
    expect(calls.dialogRenders).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.options.at(-1)?.enabled).toBe(false);
  });

  it("does not show the same badges again after a remount (a locale switch)", async () => {
    calls.server = SOME;
    const first = render(<BadgeCelebrationProbe userId="u1" />);
    await idle();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.cache?.items).toEqual([]);
    first.unmount();

    const renders = calls.dialogRenders;
    render(<BadgeCelebrationProbe userId="u1" />);
    await idle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.dialogRenders).toBe(renders);
  });

  it("does not ask on sign-in or onboarding routes", async () => {
    calls.server = SOME;
    for (const path of ["/auth/signin", "/dashboard/onboarding"]) {
      calls.pathname = path;
      const { unmount } = render(<BadgeCelebrationProbe userId="u1" />);
      await idle(5000);
      expect(calls.fetches).toBe(0);
      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();
    }
  });

  it("waits while the member is typing in a field, then opens after focus leaves", async () => {
    calls.server = SOME;
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();

    render(<BadgeCelebrationProbe userId="u1" />);
    await idle(5000);
    expect(calls.fetches).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      field.blur();
    });
    await idle(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    await idle();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not open over a field the member focused after the answer came back", async () => {
    calls.server = SOME;
    calls.cache = SOME; // Already answered, e.g. by an earlier mount.
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    render(<BadgeCelebrationProbe userId="u1" />);
    await idle(5000);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("isEditingElement", () => {
  it("counts text fields, selects and editable regions, not buttons", () => {
    const make = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.appendChild(host);
      return host.firstElementChild!;
    };
    expect(isEditingElement(make("<input />"))).toBe(true);
    expect(isEditingElement(make('<input type="email" />'))).toBe(true);
    expect(isEditingElement(make("<textarea></textarea>"))).toBe(true);
    expect(isEditingElement(make("<select></select>"))).toBe(true);
    expect(
      isEditingElement(make('<div contenteditable="true"><p>x</p></div>')),
    ).toBe(true);
    expect(isEditingElement(make('<input type="checkbox" />'))).toBe(false);
    expect(isEditingElement(make("<button>Go</button>"))).toBe(false);
    expect(isEditingElement(document.body)).toBe(false);
    expect(isEditingElement(null)).toBe(false);
  });
});
