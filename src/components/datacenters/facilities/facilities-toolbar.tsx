"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon, XIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FACILITY_PARAM,
  clearFiltersPatch,
  hasActiveFacilityFilters,
  patchSearchParams,
  type ParamPatch,
} from "@/lib/investigations/facilities-query";
import { useFacilitiesNavigation } from "./facilities-navigation";

export type FilterOption = { value: string; label: string };

export type FacilityFocus = {
  slug: string;
  canonicalName: string | null;
} | null;

const ANY = "__any";
const SEARCH_DEBOUNCE_MS = 350;

export function FacilitiesToolbar({
  statuses,
  countries,
  powerSources,
  focus,
}: {
  statuses: FilterOption[];
  countries: FilterOption[];
  powerSources: FilterOption[];
  focus: { operator: FacilityFocus; supplier: FacilityFocus };
}) {
  const t = useTranslations("datacenterInvestigation.facilities");
  const searchParams = useSearchParams();
  const { navigate } = useFacilitiesNavigation();
  const current = searchParams.toString();

  const apply = React.useCallback(
    (patch: ParamPatch, options?: { replace?: boolean }) =>
      navigate(patchSearchParams(current, patch), options),
    [current, navigate],
  );

  const flag = (key: string) => searchParams.get(key) === "1";
  const toggles = [
    { param: FACILITY_PARAM.aiOnly, label: t("aiOnly") },
    { param: FACILITY_PARAM.withSuppliers, label: t("withSuppliers") },
    { param: FACILITY_PARAM.includeUnverified, label: t("includeUnverified") },
  ];
  const focusChips = [
    {
      param: FACILITY_PARAM.operator,
      label: t("focusOperator"),
      focus: focus.operator,
      href: (slug: string) => `/investigations/operators/${slug}`,
    },
    {
      param: FACILITY_PARAM.supplier,
      label: t("focusSupplier"),
      focus: focus.supplier,
      href: (slug: string) => `/investigations/suppliers/${slug}`,
    },
  ];

  return (
    <div
      role="group"
      aria-label={t("filtersLabel")}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={searchParams.get(FACILITY_PARAM.q) ?? ""}
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          onSearch={(q) => apply({ [FACILITY_PARAM.q]: q }, { replace: true })}
        />
        <FilterSelect
          label={t("status")}
          anyLabel={t("anyStatus")}
          options={statuses}
          value={searchParams.get(FACILITY_PARAM.status)}
          onChange={(v) => apply({ [FACILITY_PARAM.status]: v })}
        />
        <FilterSelect
          label={t("country")}
          anyLabel={t("anyCountry")}
          options={countries}
          value={
            searchParams.get(FACILITY_PARAM.country)?.toUpperCase() ?? null
          }
          onChange={(v) => apply({ [FACILITY_PARAM.country]: v })}
        />
        <FilterSelect
          label={t("power")}
          anyLabel={t("anyPower")}
          options={powerSources}
          value={searchParams.get(FACILITY_PARAM.power)}
          onChange={(v) => apply({ [FACILITY_PARAM.power]: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {toggles.map(({ param, label }) => {
          const id = `facility-filter-${param}`;
          return (
            <div key={param} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={flag(param)}
                onCheckedChange={(checked) =>
                  apply({ [param]: checked === true ? "1" : null })
                }
              />
              <Label htmlFor={id} className="font-normal">
                {label}
              </Label>
            </div>
          );
        })}

        {focusChips.map(({ param, label, focus: f, href }) => {
          if (!f) return null;
          const name = f.canonicalName ?? f.slug;
          return (
            <span
              key={param}
              className="border-border bg-background inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-3 text-xs"
            >
              <span className="text-muted-foreground">{label}:</span>
              <Link href={href(f.slug)} className="font-medium hover:underline">
                {name}
              </Link>
              <button
                type="button"
                onClick={() => apply({ [param]: null })}
                aria-label={t("removeFocus", { name })}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </span>
          );
        })}

        {hasActiveFacilityFilters(current) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground ml-auto"
            onClick={() => apply(clearFiltersPatch())}
          >
            <XIcon aria-hidden />
            {t("clearFilters")}
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  anyLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  anyLabel: string;
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <Select
      value={value && known ? value : ANY}
      onValueChange={(v) => onChange(v === ANY ? null : v)}
    >
      <SelectTrigger
        aria-label={label}
        className="min-w-0 grow basis-44 sm:grow-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Debounced search box. The URL owns the value; the field only keeps what is
 * being typed. A URL change that did not come from this field (clear filters,
 * back button) resets it, while the echo of its own update does not clobber
 * characters typed since.
 */
function SearchField({
  value,
  label,
  placeholder,
  onSearch,
}: {
  value: string;
  label: string;
  placeholder: string;
  onSearch: (q: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const lastSent = React.useRef(value);
  const onSearchRef = React.useRef(onSearch);
  React.useEffect(() => {
    onSearchRef.current = onSearch;
  });

  React.useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setDraft(value);
    }
  }, [value]);

  React.useEffect(() => {
    const q = draft.trim();
    if (q === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = q;
      onSearchRef.current(q);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <form
      role="search"
      className="relative min-w-0 grow basis-64"
      onSubmit={(event) => {
        event.preventDefault();
        const q = draft.trim();
        lastSent.current = q;
        onSearchRef.current(q);
      }}
    >
      <SearchIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        name={FACILITY_PARAM.q}
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        maxLength={100}
        onChange={(event) => setDraft(event.target.value)}
        className="pl-9"
      />
    </form>
  );
}
