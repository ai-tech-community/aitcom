"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/trpc/react";
import type {
  ConflictCheckInput,
  SlotSuggestionTriple,
} from "@/components/events/event-conflict-panel";
import {
  deriveConflictPanelState,
  type EventFormData,
} from "./event-form-model";

// Long enough that typing a title doesn't spam checkConflicts, short enough
// to feel live once the organizer settles on a date/audience combo.
const CONFLICT_CHECK_DEBOUNCE_MS = 600;

/**
 * The live scheduling-conflict check (#206, ADR-0035). The gate mirrors the
 * server: a date and at least one audience. `debouncePending` is set in the
 * same effect pass that (re)starts the timer, so the panel shows "checking"
 * for the whole debounce window instead of the previous, stale result. The
 * last completed result is kept while a re-check runs, so the panel stays in
 * place (dimmed) instead of collapsing and shoving the page.
 */
export function useEventConflicts({
  form,
  enabled,
  excludeEventId,
  onApplySlot,
}: {
  form: EventFormData;
  /** False while an existing event is still loading into the form. */
  enabled: boolean;
  excludeEventId?: number;
  onApplySlot: (slot: SlotSuggestionTriple) => void;
}) {
  const gateMet = !!form.date && form.audience.length >= 1;
  const [debouncedInput, setDebouncedInput] = useState<
    ConflictCheckInput | undefined
  >(undefined);
  const [debouncePending, setDebouncePending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!enabled || !gateMet) {
      setDebouncedInput(undefined);
      setDebouncePending(false);
      return;
    }
    setDebouncePending(true);
    timer.current = setTimeout(() => {
      setDebouncePending(false);
      setDebouncedInput({
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        timezone: form.timezone || undefined,
        format: (form.format || "online") as ConflictCheckInput["format"],
        // No lat/long in the form — geocoding is server-side only.
        city: form.city || undefined,
        audience: form.audience,
        excludeEventId,
      });
    }, CONFLICT_CHECK_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [
    enabled,
    gateMet,
    form.date,
    form.startTime,
    form.endTime,
    form.timezone,
    form.format,
    form.city,
    form.audience,
    excludeEventId,
  ]);

  const check = api.events.checkConflicts.useQuery(
    debouncedInput ?? { date: "", audience: [], format: "online" },
    { enabled: !!debouncedInput, retry: 1 },
  );

  const [lastData, setLastData] = useState<typeof check.data>(undefined);
  useEffect(() => {
    if (check.data) setLastData(check.data);
  }, [check.data]);

  // Applying a suggested slot rings the date/time inputs for a second so the
  // organizer sees what changed; the check re-runs on its own afterwards.
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  const applySlot = (slot: SlotSuggestionTriple) => {
    onApplySlot(slot);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(true);
    flashTimer.current = setTimeout(() => setFlash(false), 1000);
  };

  return {
    gateMet,
    state: deriveConflictPanelState({
      gateMet,
      debouncePending,
      hasDebouncedInput: !!debouncedInput,
      isFetching: check.isFetching,
      isError: check.isError,
      conflictCount: check.data?.conflicts.length ?? 0,
    }),
    data: check.data ?? lastData,
    retry: () => void check.refetch(),
    applySlot,
    flashClass: flash
      ? "ring-success/60 ring-2 transition-shadow duration-200 motion-reduce:transition-none"
      : "",
  };
}
