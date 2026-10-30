"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_OPTIONS,
  EVENT_TYPES,
  type EventFocus,
  type EventFormat,
  type EventType,
} from "@/lib/event-metadata";

const DEBOUNCE_MS = 300;
const ANY = "__any__";

const FIT_SCORES = ["6", "7", "8", "9"] as const;

interface EventsFilterBarProps {
  visitorCountryCode?: string | null;
  visitorCountryName?: string | null;
}

function displayCountry(
  code: string | null,
  name: string | null,
  locale: string,
): string | null {
  if (code) {
    try {
      const localized = new Intl.DisplayNames([locale], { type: "region" }).of(
        code,
      );
      if (localized) return localized;
    } catch {
      // Keep the name supplied with the request.
    }
  }
  return name;
}

export function EventsFilterBar({
  visitorCountryCode = null,
  visitorCountryName = null,
}: EventsFilterBarProps = {}) {
  const t = useTranslations("events");
  const locale = useLocale();
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
        next.delete("page");
      });
    }, DEBOUNCE_MS);
  };

  const setSort = (value: string) => {
    pushParams((next) => {
      if (value === "date") next.delete("sort");
      else next.set("sort", value);
      next.delete("page");
    });
  };

  const setFilter = (key: string, value: string) => {
    pushParams((next) => {
      if (value === ANY) next.delete(key);
      else next.set(key, value);
      next.delete("page");
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

  const toggleNearMe = () => {
    pushParams((next) => {
      if (next.get("near") === "1") next.delete("near");
      else next.set("near", "1");
      next.delete("page");
    });
  };

  const type = searchParams.get("type") ?? ANY;
  const focus = searchParams.get("focus") ?? ANY;
  const format = searchParams.get("format") ?? ANY;
  const fit = searchParams.get("fit") ?? ANY;
  const aiParam = searchParams.get("ai");
  const ai = aiParam === "1" || aiParam === "0" ? aiParam : ANY;
  const sort = searchParams.get("sort") ?? "date";
  const nearMe = searchParams.get("near") === "1";

  const hasFilters =
    currentQ.length > 0 ||
    type !== ANY ||
    focus !== ANY ||
    format !== ANY ||
    fit !== ANY ||
    ai !== ANY ||
    sort !== "date" ||
    nearMe;

  const country = displayCountry(
    visitorCountryCode,
    visitorCountryName,
    locale,
  );
  const upper = (value: string) => value.toLocaleUpperCase(locale);

  const typeLabel = (value: EventType) => {
    switch (value) {
      case "workshop":
        return t("eventTypeWorkshop");
      case "hackathon":
        return t("eventTypeHackathon");
      case "deep_dive":
        return t("eventTypeDeepDive");
      case "meetup":
        return t("eventTypeMeetup");
      case "conference":
        return t("eventTypeConference");
    }
  };

  const focusLabel = (value: EventFocus) => {
    switch (value) {
      case "technical":
        return t("filters.focus.technical");
      case "marketing":
        return t("filters.focus.marketing");
      case "product":
        return t("filters.focus.product");
      case "research":
        return t("filters.focus.research");
      case "mixed":
        return t("filters.focus.mixed");
    }
  };

  const formatLabel = (value: EventFormat) => {
    switch (value) {
      case "online":
        return t("online");
      case "in-person":
        return t("formatInPerson");
      case "hybrid":
        return t("formatHybrid");
    }
  };

  const sortLabel = (value: string) => {
    switch (value) {
      case "fit":
        return t("filters.sortFit");
      case "newest":
        return t("filters.sortNewest");
      case "near":
        return t("filters.sortNearest");
      default:
        return t("filters.sortDate");
    }
  };

  return (
    <div className="border-border mt-4 space-y-3 rounded-lg border p-4">
      {country && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider">
          <span className="text-muted-foreground">
            {upper(
              t("filters.detected", {
                country: visitorCountryCode
                  ? `${country} (${visitorCountryCode})`
                  : country,
              }),
            )}
          </span>
          <button
            type="button"
            onClick={toggleNearMe}
            className={`rounded border px-2.5 py-1 transition-colors ${
              nearMe
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-secondary/40"
            }`}
          >
            {nearMe
              ? `✓ ${upper(t("filters.inCountry", { country }))}`
              : upper(t("filters.showOnly", { country }))}
          </button>
        </div>
      )}
      <Input
        type="text"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder={`/ ${upper(t("filters.search"))}`}
        className="font-mono text-sm tracking-wider"
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Select value={type} onValueChange={(v) => setFilter("type", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder={t("filters.anyType")}>
              {type === ANY ||
              !(EVENT_TYPES as readonly string[]).includes(type)
                ? t("filters.anyType")
                : upper(typeLabel(type as EventType))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.anyType")}</SelectItem>
            {EVENT_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {upper(typeLabel(value))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={focus} onValueChange={(v) => setFilter("focus", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder={t("filters.anyFocus")}>
              {focus === ANY ||
              !(EVENT_FOCUS_OPTIONS as readonly string[]).includes(focus)
                ? t("filters.anyFocus")
                : focusLabel(focus as EventFocus)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.anyFocus")}</SelectItem>
            {EVENT_FOCUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {focusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={format} onValueChange={(v) => setFilter("format", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder={t("filters.anyFormat")}>
              {format === ANY ||
              !(EVENT_FORMAT_OPTIONS as readonly string[]).includes(format)
                ? t("filters.anyFormat")
                : formatLabel(format as EventFormat)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.anyFormat")}</SelectItem>
            {EVENT_FORMAT_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {formatLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ai} onValueChange={(v) => setFilter("ai", v)}>
          <SelectTrigger
            aria-label={t("filterAi")}
            className="font-mono text-xs tracking-wider"
          >
            <SelectValue placeholder={t("filterAiAll")}>
              {ai === "1"
                ? t("filterAiYes")
                : ai === "0"
                  ? t("filterAiNo")
                  : t("filterAiAll")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filterAiAll")}</SelectItem>
            <SelectItem value="1">{t("filterAiYes")}</SelectItem>
            <SelectItem value="0">{t("filterAiNo")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={fit} onValueChange={(v) => setFilter("fit", v)}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder={t("filters.anyFit")}>
              {(FIT_SCORES as readonly string[]).includes(fit)
                ? t("filters.fitAtLeast", { score: fit })
                : t("filters.anyFit")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.anyFit")}</SelectItem>
            {FIT_SCORES.map((score) => (
              <SelectItem key={score} value={score}>
                {t("filters.fitAtLeast", { score })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="font-mono text-xs tracking-wider">
            <SelectValue placeholder={t("filters.sortDate")}>
              {sortLabel(sort)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(["date", "fit", "newest", "near"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {sortLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={resetAll}
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider underline-offset-4 hover:underline"
        >
          {t("filters.clear")}
        </button>
      )}
    </div>
  );
}
