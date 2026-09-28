"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AutosaveStatus, UseAutosaveResult } from "./use-autosave";
import type { PaneSaveState } from "./course-builder";

/**
 * A pane whose draft cannot be saved yet (say, a blank title) pauses its
 * autosave, and the hook then reports nothing pending. That draft is still
 * unsaved work, so it is reported as "dirty".
 */
export function pausedStatus(
  status: AutosaveStatus,
  paused: boolean,
): AutosaveStatus {
  return paused && (status === "idle" || status === "saved") ? "dirty" : status;
}

/**
 * Reports one pane's save state up to the builder (the `onStatusChange`
 * seam every editing pane shares), so the top bar, the leave-page guard and
 * the publish/preview/switch checks all see it. Returns the reported status.
 */
export function usePaneReport({
  autosave,
  paused,
  onStatusChange,
}: {
  autosave: UseAutosaveResult;
  paused: boolean;
  onStatusChange: (state: PaneSaveState) => void;
}): AutosaveStatus {
  const { status, savedAt, flush, retry } = autosave;
  const reported = pausedStatus(status, paused);

  const pausedRef = useRef(paused);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    pausedRef.current = paused;
    onStatusChangeRef.current = onStatusChange;
  });

  const paneFlush = useCallback(
    async () => pausedStatus(await flush(), pausedRef.current),
    [flush],
  );
  const paneRetry = useCallback(async () => {
    await retry();
  }, [retry]);

  useEffect(() => {
    onStatusChangeRef.current({
      status: reported,
      savedAt,
      flush: paneFlush,
      retry: paneRetry,
    });
  }, [reported, savedAt, paneFlush, paneRetry]);

  return reported;
}
