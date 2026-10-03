"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { usePathname } from "@/i18n/navigation";
import type { UnseenEarnings } from "@/server/badges/earning-moment";
import { api } from "@/trpc/react";

import { isCelebrationRoute } from "./celebration-route";

/**
 * The dialog's code (emblems, dialog primitive, share UI) loads only when
 * there is something to celebrate.
 */
const BadgeCelebrationDialog = dynamic(
  () => import("./badge-celebration").then((m) => m.BadgeCelebrationDialog),
  { ssr: false },
);

/** When the browser has no idle callback: after first paint has settled. */
const FALLBACK_DELAY_MS = 1000;
/** Longest wait for an idle moment before going ahead anyway. */
const IDLE_TIMEOUT_MS = 3000;

/** What the query cache holds once the moment is over. */
const NOTHING_UNSEEN: UnseenEarnings = {
  items: [],
  moreIds: [],
  profile: null,
};

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * True once `active` has held through an idle moment of the browser (after
 * first paint), and false again as soon as it stops holding.
 */
function useQuietMoment(active: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!active) return;
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), {
        timeout: IDLE_TIMEOUT_MS,
      });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), FALLBACK_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [active]);
  return ready && active;
}

/** Input types that take no typing; focus on them is not editing. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Whether focus is in a field the member is typing in or choosing from. */
export function isEditingElement(element: Element | null): boolean {
  if (!element) return false;
  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(element.type);
  }
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      element.closest('[contenteditable=""], [contenteditable="true"]') !==
        null)
  );
}

/** Whether focus is in a text field, select or editable region right now. */
function useEditingFocus(): boolean {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    // On focusout the next element is not focused yet: check after it.
    let pending: number | undefined;
    const update = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() =>
        setEditing(isEditingElement(document.activeElement)),
      );
    };
    setEditing(isEditingElement(document.activeElement));
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.clearTimeout(pending);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return editing;
}

/**
 * The earning moment's probe (ADR-0039): mounted once in the signed-in
 * session chrome, it decides whether there is anything to celebrate and
 * only then loads the dialog.
 *
 * It asks after first paint, in an idle moment, and never on routes that
 * need the member's focus (sign-in, onboarding) or while they are typing
 * in a field; it waits until focus leaves the field. It asks once per page
 * load, and when the moment is over it empties the cached answer, so a
 * remount (a locale switch) never shows the same badges again.
 */
export function BadgeCelebrationProbe({ userId }: { userId: string }) {
  const pathname = usePathname();
  const editing = useEditingFocus();
  const quiet = useQuietMoment(isCelebrationRoute(pathname) && !editing);
  const utils = api.useUtils();
  const [phase, setPhase] = useState<
    | { kind: "waiting" }
    | { kind: "open"; earnings: UnseenEarnings }
    | { kind: "done" }
  >({ kind: "waiting" });
  const waiting = phase.kind === "waiting";
  const unseen = api.badges.unseen.useQuery(undefined, {
    enabled: quiet && waiting,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  useEffect(() => {
    if (!waiting) return;
    // Supplementary: a failed load just means no celebration this time.
    if (unseen.isError) {
      setPhase({ kind: "done" });
      return;
    }
    if (!unseen.data || !quiet) return;
    setPhase(
      unseen.data.items.length > 0
        ? { kind: "open", earnings: unseen.data }
        : { kind: "done" },
    );
  }, [waiting, unseen.data, unseen.isError, quiet]);

  const finish = useCallback(() => {
    utils.badges.unseen.setData(undefined, NOTHING_UNSEEN);
    setPhase({ kind: "done" });
  }, [utils]);

  if (phase.kind !== "open") return null;
  return (
    <BadgeCelebrationDialog
      userId={userId}
      earnings={phase.earnings}
      onDone={finish}
    />
  );
}
