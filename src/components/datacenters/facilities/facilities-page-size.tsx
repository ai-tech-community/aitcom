"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_FACILITY_PAGE_SIZE,
  FACILITY_PAGE_SIZES,
  FACILITY_PARAM,
  patchSearchParams,
} from "@/lib/investigations/facilities-query";
import { useFacilitiesNavigation } from "./facilities-navigation";

export function FacilitiesPageSize({ pageSize }: { pageSize: number }) {
  const t = useTranslations("datacenterInvestigation.facilities");
  const searchParams = useSearchParams();
  const { navigate } = useFacilitiesNavigation();

  return (
    <div className="flex items-center gap-2">
      <span id="facilities-page-size" className="text-muted-foreground text-sm">
        {t("rowsPerPage")}
      </span>
      <Select
        value={String(pageSize)}
        onValueChange={(v) =>
          navigate(
            patchSearchParams(searchParams.toString(), {
              [FACILITY_PARAM.pageSize]:
                Number(v) === DEFAULT_FACILITY_PAGE_SIZE ? null : v,
            }),
          )
        }
      >
        <SelectTrigger
          size="sm"
          aria-labelledby="facilities-page-size"
          className="font-mono tabular-nums"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FACILITY_PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)} className="font-mono">
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
