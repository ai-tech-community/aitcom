"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildStartupJobsPath } from "@/lib/investigations/startups";
import {
  STARTUP_JOBS_SORTS,
  parseStartupJobsQuery,
  type StartupJobsQuery,
  type StartupJobsSort,
} from "@/lib/investigations/startup-roles";

export function StartupsJobsFilters({
  query,
  companies,
  locations,
  workTypes,
  labels,
}: {
  query: StartupJobsQuery;
  companies: { slug: string; name: string }[];
  locations: string[];
  workTypes: string[];
  labels: {
    search: string;
    company: string;
    companyAll: string;
    location: string;
    locationAll: string;
    workType: string;
    workTypeAll: string;
    sortRole: string;
    sortCompany: string;
    sortLocation: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<StartupJobsQuery>) {
    const filterChanged =
      next.q !== undefined ||
      next.company !== undefined ||
      next.location !== undefined ||
      next.workType !== undefined ||
      next.sort !== undefined;
    const merged = parseStartupJobsQuery({
      ...query,
      ...next,
      page: next.page ?? (filterChanged ? 1 : query.page),
    });
    const path = buildStartupJobsPath(merged);
    const qs = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const sortLabel: Record<StartupJobsSort, string> = {
    role: labels.sortRole,
    company: labels.sortCompany,
    location: labels.sortLocation,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="jobs-search" className="sr-only">
            {labels.search}
          </Label>
          <Input
            id="jobs-search"
            value={query.q}
            placeholder={labels.search}
            onChange={(event) => replaceQuery({ q: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="jobs-sort" className="sr-only">
            {labels.sortRole}
          </Label>
          <Select
            value={query.sort}
            onValueChange={(value) =>
              replaceQuery({ sort: value as StartupJobsSort })
            }
          >
            <SelectTrigger id="jobs-sort" className="w-full min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STARTUP_JOBS_SORTS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {sortLabel[id]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-44 flex-1 flex-col gap-2">
          <Label htmlFor="jobs-company" className="sr-only">
            {labels.company}
          </Label>
          <Select
            value={query.company || "all"}
            onValueChange={(value) =>
              replaceQuery({ company: value === "all" ? "" : value })
            }
          >
            <SelectTrigger id="jobs-company" className="w-full">
              <SelectValue placeholder={labels.company} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{labels.companyAll}</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.slug} value={company.slug}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-44 flex-1 flex-col gap-2">
          <Label htmlFor="jobs-location" className="sr-only">
            {labels.location}
          </Label>
          <Select
            value={query.location || "all"}
            onValueChange={(value) =>
              replaceQuery({ location: value === "all" ? "" : value })
            }
          >
            <SelectTrigger id="jobs-location" className="w-full">
              <SelectValue placeholder={labels.location} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{labels.locationAll}</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-44 flex-1 flex-col gap-2">
          <Label htmlFor="jobs-work-type" className="sr-only">
            {labels.workType}
          </Label>
          <Select
            value={query.workType || "all"}
            onValueChange={(value) =>
              replaceQuery({ workType: value === "all" ? "" : value })
            }
          >
            <SelectTrigger id="jobs-work-type" className="w-full">
              <SelectValue placeholder={labels.workType} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{labels.workTypeAll}</SelectItem>
                {workTypes.map((workType) => (
                  <SelectItem key={workType} value={workType}>
                    {workType}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
