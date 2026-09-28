"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChangesGuard } from "./use-autosave";

/** Marks the extra history entry the guard adds for this page. */
const GUARD_ENTRY = "__classroomBuilderLeaveGuard";

type HistoryState = Record<string, unknown> | null;
const onGuardEntry = () =>
  !!(window.history.state as HistoryState)?.[GUARD_ENTRY];
const guardEntryState = () => ({
  ...((window.history.state as HistoryState) ?? {}),
  [GUARD_ENTRY]: true,
});

/**
 * Every way out of the builder while work is not safely saved:
 *
 * - closing or reloading the tab, or leaving the site: the browser's own
 *   "leave site?" prompt;
 * - an in-app link that leaves this page (the top bar's back link, the site
 *   navbar…): the click is caught before the link acts on it;
 * - the browser's Back button: once there is unsaved work, the page adds one
 *   history entry for itself, so Back lands here first and can ask.
 *
 * `confirmLeave` asks the author and does whatever must happen before going
 * (the builder tries to save everything); it resolves true to go. Links that
 * stay on this page (another lesson), open elsewhere (new tab, download) or
 * leave the site are left alone.
 */
export function useLeaveGuard({
  active,
  confirmLeave,
}: {
  active: boolean;
  confirmLeave: () => Promise<boolean>;
}): void {
  const router = useRouter();
  const activeRef = useRef(active);
  const confirmRef = useRef(confirmLeave);
  // The page's own address right now; Back has already changed it by the time
  // popstate fires.
  const hereRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = active;
    confirmRef.current = confirmLeave;
    hereRef.current = window.location.href;
  });

  useUnsavedChangesGuard(active);

  // In-app links.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!activeRef.current || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const to = new URL(anchor.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname) return;

      // Capture phase on the document: runs before the link's own handler
      // (Next.js Link), which then never sees the click.
      e.preventDefault();
      e.stopPropagation();
      void confirmRef.current().then((go) => {
        if (go) router.push(`${to.pathname}${to.search}${to.hash}`);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  // Browser Back. `onEntry`: this page's extra entry is the current one.
  const onEntryRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (onGuardEntry()) {
      onEntryRef.current = true;
      return;
    }
    if (!onEntryRef.current) {
      window.history.pushState(guardEntryState(), "", window.location.href);
      onEntryRef.current = true;
    }
  }, [active]);

  useEffect(() => {
    onEntryRef.current = onGuardEntry();
    const onPopState = () => {
      if (onGuardEntry()) {
        onEntryRef.current = true; // Forward, back onto the extra entry.
        return;
      }
      if (!onEntryRef.current) return; // Not a Back out of this page.
      onEntryRef.current = false;
      if (!activeRef.current) {
        // Everything is saved: carry on with the author's Back.
        window.history.back();
        return;
      }
      // Stay for now: put the extra entry (at this page's address) back,
      // then ask.
      window.history.pushState(
        guardEntryState(),
        "",
        hereRef.current ?? window.location.href,
      );
      onEntryRef.current = true;
      void confirmRef.current().then((go) => {
        if (!go) return;
        onEntryRef.current = false;
        // Past the extra entry and this page's own.
        window.history.go(-2);
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
