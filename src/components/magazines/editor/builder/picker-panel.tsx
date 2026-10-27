"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatEventDay } from "@/lib/event-time";
import type { CandidateFact, PickableKindId } from "@/lib/magazines/picker";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

import { SuggestionReasonText } from "../suggestion-reason";
import type { AddPanelProps } from "./items/types";

/** How long a search waits after the last keystroke. */
const SEARCH_PAUSE_MS = 250;

/** Where focus goes after an item is added: an Add button, or the empty text. */
type FocusTarget = { reference: string } | "empty";

/**
 * One fact, in the viewer's language. Bylines and source names are ordinary
 * words (Sans); counts and dates are the machine voice (Mono).
 */
function Fact({ fact }: { fact: CandidateFact }) {
  const t = useTranslations("magazineEditor.builder.add.facts");
  const locale = useLocale();

  switch (fact.type) {
    case "byline":
      return (
        <span className="truncate">{t("byline", { name: fact.name })}</span>
      );
    case "source":
      return <span className="truncate">{fact.host}</span>;
    case "count":
      return (
        <span className="font-mono">{t(fact.what, { count: fact.value })}</span>
      );
    case "date":
      return (
        <span className="font-mono">
          {t(fact.label, { date: formatEventDay(fact.at, locale) })}
        </span>
      );
    case "eventStatus":
      return <span>{t(fact.status)}</span>;
    default: {
      const unreachable: never = fact;
      return unreachable;
    }
  }
}

/**
 * Search one kind of content and add it to the issue. The list leaves out
 * what the issue already holds, and tracks that — and the focus that moves
 * on after Add — by `candidate.reference`, never by a kind's own id.
 */
export function PickerPanel({
  kind,
  communitySlug,
  referencesInIssue,
  onAdd,
}: AddPanelProps & { kind: PickableKindId }) {
  const t = useTranslations("magazineEditor.builder.add");
  const searchId = useId();
  const [typed, setTyped] = useState("");
  const words = useDebouncedValue(typed.trim(), SEARCH_PAUSE_MS);
  const query = api.magazines.pickerCandidates.useQuery(
    {
      slug: communitySlug,
      kind,
      query: words,
      exclude: [...referencesInIssue],
    },
    { placeholderData: keepPreviousData },
  );
  const addButtons = useRef(new Map<string, HTMLButtonElement>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const offered = useMemo(
    () =>
      (query.data ?? []).filter(
        (candidate) => !referencesInIssue.has(candidate.reference),
      ),
    [query.data, referencesInIssue],
  );

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === "empty" && (query.isPlaceholderData || query.isFetching)) {
      // Excluding the last displayed result starts a refill. Keep focus on
      // the stable input until a replacement Add button or final empty text exists.
      searchRef.current?.focus();
      return;
    }
    pendingFocus.current = null;
    if (target === "empty") {
      const first = offered[0];
      const button = first && addButtons.current.get(first.reference);
      (button ?? emptyRef.current ?? searchRef.current)?.focus();
    } else addButtons.current.get(target.reference)?.focus();
  }, [offered, query.isPlaceholderData, query.isFetching]);

  const add = (index: number) => {
    const chosen = offered[index];
    if (!chosen) return;
    const next = offered[index + 1] ?? offered[index - 1];
    pendingFocus.current = next ? { reference: next.reference } : "empty";
    onAdd(chosen.input, { title: chosen.title, openHref: chosen.openHref });
  };

  const searchLabel = t(`search.${kind}`);
  const loaded =
    !query.isLoading &&
    !query.isFetching &&
    !query.isPlaceholderData &&
    !query.isError &&
    query.data !== undefined;
  const resultStatus = loaded
    ? offered.length === 0 && words
      ? t("noMatch", { query: words })
      : t("results", { count: offered.length })
    : "";

  let body;
  if (query.isLoading && !query.data) {
    body = (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  } else if (query.isError || !query.data) {
    body = (
      <ErrorState
        title={t("loadFailed")}
        retryLabel={t("tryAgain")}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (offered.length === 0) {
    body = (
      <p
        ref={emptyRef}
        tabIndex={-1}
        className="text-muted-foreground rounded-sm text-sm outline-none"
      >
        {words ? t("noMatch", { query: words }) : t(`empty.${kind}`)}
      </p>
    );
  } else {
    body = (
      <ul
        aria-busy={query.isPlaceholderData}
        className={cn(
          "divide-border flex flex-col divide-y rounded-md border",
          query.isPlaceholderData && "opacity-50",
        )}
      >
        {offered.map((candidate, index) => (
          <li
            key={candidate.reference}
            className="flex items-center gap-3 px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {candidate.title}
              </span>
              {candidate.facts.length > 0 && (
                <p className="text-muted-foreground flex min-w-0 flex-wrap gap-x-2 text-xs">
                  {candidate.facts.map((fact, factIndex) => (
                    <Fragment key={factIndex}>
                      {factIndex > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="sr-only">, </span>
                        </>
                      )}
                      <Fact fact={fact} />
                    </Fragment>
                  ))}
                </p>
              )}
              {candidate.reason && (
                <p className="text-muted-foreground text-xs break-words">
                  <SuggestionReasonText reason={candidate.reason} />
                </p>
              )}
            </div>
            <Button
              ref={(el: HTMLButtonElement | null) => {
                if (el) addButtons.current.set(candidate.reference, el);
                else addButtons.current.delete(candidate.reference);
              }}
              type="button"
              variant="outline"
              size="sm"
              aria-label={t("addItem", { title: candidate.title })}
              onClick={() => add(index)}
            >
              {t("add")}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={searchId}>{searchLabel}</Label>
        <Input
          ref={searchRef}
          id={searchId}
          value={typed}
          placeholder={searchLabel}
          onChange={(event) => {
            pendingFocus.current = null;
            setTyped(event.target.value);
          }}
          onBlur={() => {
            // A deliberate move while the request runs cancels the focus handoff.
            if (pendingFocus.current === "empty") pendingFocus.current = null;
          }}
        />
        <p role="status" aria-live="polite" className="sr-only">
          {resultStatus}
        </p>
      </div>
      {!words && offered[0]?.reason && (
        <h3 className="text-sm font-medium">{t("suggested")}</h3>
      )}
      {body}
      {loaded && (
        <p className="text-muted-foreground text-sm">{t(`hint.${kind}`)}</p>
      )}
    </div>
  );
}
