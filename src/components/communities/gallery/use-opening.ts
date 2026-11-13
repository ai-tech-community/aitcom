"use client";

import { useCallback, useState } from "react";

/**
 * One opening of a dialog. A new `key` mounts it afresh, so nothing from
 * the last opening carries over; `open: false` keeps it mounted while it
 * animates out.
 */
export type Opening<T> = T & { key: number; open: boolean };

/** Opens a dialog afresh with `value`, or closes the current opening. */
export function useOpening<T>() {
  const [opening, setOpening] = useState<Opening<T> | null>(null);
  const open = useCallback(
    (value: T) =>
      setOpening((current) => ({
        ...value,
        key: (current?.key ?? 0) + 1,
        open: true,
      })),
    [],
  );
  const close = useCallback(
    () => setOpening((current) => current && { ...current, open: false }),
    [],
  );
  return [opening, open, close] as const;
}
