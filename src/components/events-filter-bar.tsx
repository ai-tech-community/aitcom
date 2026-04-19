"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EVENT_FOCUS_LABELS,
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
} from "@/lib/event-metadata";

const DEBOUNCE_MS = 300;
const ANY = "__any__";

const FIT_OPTIONS = [
  { value: ANY, label: "Any AIT fit" },
  { value: "6", label: "AIT ≥ 6" },
  { value: "7", label: "AIT ≥ 7" },
  { value: "8", label: "AIT ≥ 8" },
  { value: "9", label: "AIT ≥ 9" },
];

export function EventsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentQ = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(currentQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearch(currentQ);
  }, [currentQ]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const pushParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams((next) => {
        if (value.trim().length > 0) next.set("q", value.trim());
        else next.delete("q");
      });
    }, DEBOUNCE_MS);
  };

  const setFilter = (key: string, value: string) => {
    pushParams((next) => {
      if (value === ANY) next.delete(key);
      else next.set(key, value);
    });
  };

  const resetAll = () => {
    startTransition(() => {
      const past = searchParams.get("past");
      router.replace(past ? `${pathname}?past=${past}` : pathname, {
        scroll: false,
      });
    });
  };

  const type = searchParams.get("type") ?? ANY;
  const focus = searchParams.get("focus") ?? ANY;
  const format = searchParams.get("format") ?? ANY;
  const fit = searchParams.get("fit") ?? ANY;

  const hasFilters =
    currentQ.length > 0 ||
    type !== ANY ||
    focus !== ANY ||
    format !== ANY ||
    fit !== ANY;

  return (
    <div className="border-border mt-4 space-y-3 rounded-lg border p-4">
      <Input
        type="text"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="/ SEARCH TITLE OR SUMMARY"
        className="font-mono text-sm tracking-wider"
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={type} onValueChange={(v) => setFilter("type", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder="Any type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any type</SelectItem>
            {EVENT_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={focus} onValueChange={(v) => setFilter("focus", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder="Any focus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any focus</SelectItem>
            {EVENT_FOCUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_FOCUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={format} onValueChange={(v) => setFilter("format", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder="Any format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any format</SelectItem>
            {EVENT_FORMAT_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_FORMAT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fit} onValueChange={(v) => setFilter("fit", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder="Any AIT fit" />
          </SelectTrigger>
          <SelectContent>
            {FIT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={resetAll}
          className="text-muted-foreground hover:text-foreground font-mono text-[11px] tracking-wider underline-offset-4 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
