"use client";

import { useCallback, useEffect, useState } from "react";

import type { BenchmarkModelSurface } from "@/lib/benchmark-constants";
import { BENCHMARK_MODEL_SURFACES } from "@/lib/benchmark-constants";

const STORAGE_KEY = "ait.benchmark.surface";

function readStored(): BenchmarkModelSurface | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return (BENCHMARK_MODEL_SURFACES as readonly string[]).includes(raw)
    ? (raw as BenchmarkModelSurface)
    : null;
}

/**
 * Persists the contributor's chosen model surface in localStorage so
 * /benchmark/contribute can default to it on subsequent visits.
 * Returns null until hydration is complete to avoid SSR/CSR mismatch.
 * See ADR-0009 decision 2.
 */
export function useStoredSurface(): [
  BenchmarkModelSurface | null,
  (next: BenchmarkModelSurface | null) => void,
  boolean,
] {
  const [value, setValue] = useState<BenchmarkModelSurface | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(readStored());
    setHydrated(true);
  }, []);

  const update = useCallback((next: BenchmarkModelSurface | null) => {
    setValue(next);
    if (typeof window === "undefined") return;
    if (next === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return [value, update, hydrated];
}
