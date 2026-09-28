import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));

import { useLeaveGuard } from "./use-leave-guard";

const BUILDER = "/en/communities/hub/classroom/intro-1/edit";

function link(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement("a");
  a.href = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "go";
  document.body.appendChild(a);
  return a;
}

/** Clicks like a user; returns whether the browser would have followed it. */
function click(el: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  el.dispatchEvent(event);
  return !event.defaultPrevented;
}

function guard(active: boolean, confirmLeave = vi.fn(async () => true)) {
  const view = renderHook(
    ({ active: a }) => useLeaveGuard({ active: a, confirmLeave }),
    { initialProps: { active } },
  );
  return { ...view, confirmLeave };
}

beforeEach(() => {
  nav.push.mockReset();
  window.history.replaceState(null, "", `${BUILDER}?lesson=21`);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useLeaveGuard: links", () => {
  it("lets links through while every change is saved", () => {
    const { confirmLeave } = guard(false);
    expect(click(link("/en/communities/hub/classroom"))).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  it("asks before following a link out of the builder, then goes there", async () => {
    const { confirmLeave } = guard(true);
    const followed = click(link("/en/communities/hub/classroom?tab=all#top"));
    expect(followed).toBe(false);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(
        "/en/communities/hub/classroom?tab=all#top",
      ),
    );
  });

  it("stays when the author chooses to stay", async () => {
    const confirmLeave = vi.fn(async () => false);
    guard(true, confirmLeave);
    expect(click(link("/en/communities"))).toBe(false);
    await waitFor(() => expect(confirmLeave).toHaveBeenCalled());
    await Promise.resolve();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("lets links that stay in the builder through", () => {
    const { confirmLeave } = guard(true);
    // Same page, other lesson: not leaving the builder.
    expect(click(link(`${BUILDER}?lesson=22`))).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  it("leaves new-tab, download and other-site links to the browser", () => {
    const { confirmLeave } = guard(true);
    expect(click(link("/en/communities"), { metaKey: true })).toBe(true);
    expect(click(link("/en/communities"), { ctrlKey: true })).toBe(true);
    expect(click(link("/en/communities", { target: "_blank" }))).toBe(true);
    expect(click(link("/en/file.pdf", { download: "" }))).toBe(true);
    expect(click(link("https://elsewhere.example/"))).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  it("catches a click on something inside the link", () => {
    const { confirmLeave } = guard(true);
    const a = link("/en/communities");
    const icon = document.createElement("span");
    a.appendChild(icon);
    expect(click(icon)).toBe(false);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
  });
});

describe("useLeaveGuard: browser Back", () => {
  it("asks on Back while work is unsaved, and stays on this page when told to", async () => {
    const confirmLeave = vi.fn(async () => false);
    const start = window.history.length;
    guard(true, confirmLeave);
    // One extra entry for this page, so Back lands here first.
    expect(window.history.length).toBe(start + 1);

    window.history.back();
    await waitFor(() => expect(confirmLeave).toHaveBeenCalledTimes(1));
    expect(window.location.pathname + window.location.search).toBe(
      `${BUILDER}?lesson=21`,
    );
  });

  it("goes back past this page once the author confirms", async () => {
    const go = vi.spyOn(window.history, "go");
    const { confirmLeave } = guard(true);
    window.history.back();
    await waitFor(() => expect(confirmLeave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(go).toHaveBeenCalledWith(-2));
  });

  it("keeps going back without asking once the work was saved", async () => {
    const back = vi.spyOn(window.history, "back");
    const { confirmLeave, rerender } = guard(true);
    rerender({ active: false });
    window.history.back();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(2));
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  it("adds no history entry while nothing was ever unsaved", () => {
    const start = window.history.length;
    guard(false);
    expect(window.history.length).toBe(start);
  });
});
