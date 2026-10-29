import { absoluteLocaleUrl } from "@/lib/metadata";
import { slugify } from "@/lib/text-utils";
import { isReservedDatacenterSlug } from "@/lib/investigations/datacenter-investigation-routes";
import {
  DATACENTER_STATUS,
  PERMIT_KINDS,
  PERMIT_STATUS,
  type DatacenterSource,
  type DatacenterStatus,
  type PermitKind,
  type PermitStatus,
} from "@/server/db/schema";

/** Hub URL. Stays `/investigations` (locale prefix is added by routing). */
export const INVESTIGATIONS_PATH = "/investigations";

/** Document title. The root layout appends " - AIT Community". */
export const INVESTIGATIONS_TITLE = "AI Datacenter Investigations";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type FacilityPermit = {
  kind: PermitKind;
  issuingBody: string;
  status: PermitStatus;
  appliedDate: string | null;
  issuedDate: string | null;
  sourceUrl: string;
};

export type StoredFacility = {
  id: string;
  slug: string;
  name: string;
  operatorKey: string;
  operatorName: string;
  country: string;
  city: string | null;
  lat: number;
  lng: number;
  capacityMw: number | null;
  status: DatacenterStatus;
  sourceUrl: string;
  checkedAt: Date;
  updatedAt: Date;
  sources: DatacenterSource[];
  permits: FacilityPermit[];
};

export type FacilitySave = {
  id: string | null;
  slug: string;
  name: string;
  operatorKey: string;
  operatorName: string;
  country: string;
  city: string | null;
  lat: number;
  lng: number;
  capacityMw: number | null;
  status: DatacenterStatus;
  sourceUrl: string;
  checkedAt: Date;
  updatedAt: Date;
  sources: DatacenterSource[];
  permits: FacilityPermit[] | undefined;
};

export type FacilityRepo = {
  findBySlug(slug: string): Promise<StoredFacility | null>;
  findByNameOperator(
    name: string,
    operator: string,
  ): Promise<StoredFacility | null>;
  slugTaken(slug: string): Promise<boolean>;
  save(input: FacilitySave): Promise<StoredFacility>;
};

export type FacilityPublishResult =
  | {
      ok: true;
      inserted: boolean;
      slug: string;
      path: string;
      url: string;
      sourceUrl: string;
      checkedAt: string;
      updatedAt: string;
      status: DatacenterStatus;
    }
  | { ok: false; error: string };

export function datacenterFacilityPath(slug: string): string {
  return `/investigations/datacenters/${slug}`;
}

export function datacenterFacilityUrl(slug: string): string {
  return absoluteLocaleUrl("en", datacenterFacilityPath(slug));
}

/** https URL with a host. Blank and non-https values are refused. */
export function httpsSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return trimmed;
}

export function operatorMatches(
  brand: { slug: string; canonicalName: string },
  operator: string,
): boolean {
  const key = slugify(operator);
  const name = operator.trim().toLowerCase();
  return (
    Boolean(key) &&
    (brand.slug === key ||
      slugify(brand.canonicalName) === key ||
      brand.canonicalName.trim().toLowerCase() === name)
  );
}

export function mergeSource(
  sources: DatacenterSource[] | null | undefined,
  sourceUrl: string,
): DatacenterSource[] {
  const list = Array.isArray(sources) ? sources : [];
  if (list.some((source) => source.url === sourceUrl)) return list;
  return [...list, { url: sourceUrl }];
}

export function mergePermits(
  existing: readonly FacilityPermit[],
  incoming: readonly FacilityPermit[],
): FacilityPermit[] {
  const next = [...existing];
  for (const permit of incoming) {
    const index = next.findIndex(
      (row) =>
        row.kind === permit.kind &&
        row.issuingBody.trim().toLowerCase() ===
          permit.issuingBody.trim().toLowerCase(),
    );
    if (index >= 0) next[index] = permit;
    else next.push(permit);
  }
  return next;
}

export function formatDotDate(
  value: Date | string | null | undefined,
): string | null {
  const date = asDate(value);
  if (!date) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}.${month}.${day}`;
}

export function formatInvestigationsUpdated(
  value: Date | string | null | undefined,
): { dateTime: string; label: string } | null {
  const date = asDate(value);
  if (!date) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return {
    dateTime: `${date.getUTCFullYear()}-${month}-${day}`,
    label: `Updated ${date.getUTCFullYear()}.${month}.${day}`,
  };
}

export function formatCheckedAt(
  value: Date | string | null | undefined,
): string | null {
  const dot = formatDotDate(value);
  return dot ? `Checked ${dot}` : null;
}

type FacilityPage = { path: string; updatedAt?: Date };

/** Facility paths plus the hub lastmod (latest facility updatedAt). */
export function mergeFacilitySitemap(
  pages: readonly FacilityPage[],
  updatedAtByPath: ReadonlyMap<string, Date>,
): { paths: string[]; updatedAtByPath: Map<string, Date> } {
  const updated = new Map(updatedAtByPath);
  const paths: string[] = [];
  let latest: Date | undefined;
  for (const page of pages) {
    if (!page.path || paths.includes(page.path)) continue;
    paths.push(page.path);
    if (!page.updatedAt) continue;
    updated.set(page.path, page.updatedAt);
    if (!latest || page.updatedAt > latest) latest = page.updatedAt;
  }
  if (latest) updated.set(INVESTIGATIONS_PATH, latest);
  return { paths, updatedAtByPath: updated };
}

type Draft = {
  name: string;
  operator: string;
  country: string;
  city: string | null | undefined;
  lat: number;
  lng: number;
  capacityMw: number | null | undefined;
  status: DatacenterStatus;
  sourceUrl: string;
  checkedAt: Date;
  requestedSlug: string | null;
  permits: FacilityPermit[] | undefined;
};

export async function publishFacilityWithRepo(
  input: unknown,
  repo: FacilityRepo,
  now: Date = new Date(),
): Promise<FacilityPublishResult> {
  const parsed = parseFacilityDraft(input);
  if (!parsed.ok) return parsed;
  const draft = parsed.value;
  const requested = draft.requestedSlug;
  const bySlug = requested ? await repo.findBySlug(requested) : null;
  if (requested && !bySlug && isReservedDatacenterSlug(requested)) {
    return { ok: false, error: "slug is reserved." };
  }
  const byName = bySlug
    ? null
    : await repo.findByNameOperator(draft.name, draft.operator);
  const existing = bySlug ?? byName;
  const slug = existing ? existing.slug : await allocateSlug(draft, repo);
  if (typeof slug !== "string") return slug;

  let operatorKey = slugify(draft.operator);
  let operatorName = draft.operator.trim();
  if (
    existing &&
    operatorMatches(
      { slug: existing.operatorKey, canonicalName: existing.operatorName },
      draft.operator,
    )
  ) {
    operatorKey = existing.operatorKey;
    operatorName = existing.operatorName;
  }
  if (!operatorKey) {
    return { ok: false, error: "operator is required." };
  }
  const saved = await repo.save({
    id: existing?.id ?? null,
    slug,
    name: draft.name,
    operatorKey,
    operatorName,
    country: draft.country,
    city: draft.city === undefined ? (existing?.city ?? null) : draft.city,
    lat: draft.lat,
    lng: draft.lng,
    capacityMw:
      draft.capacityMw === undefined
        ? (existing?.capacityMw ?? null)
        : draft.capacityMw,
    status: draft.status,
    sourceUrl: draft.sourceUrl,
    checkedAt: draft.checkedAt,
    updatedAt: now,
    sources: mergeSource(existing?.sources, draft.sourceUrl),
    permits:
      draft.permits === undefined
        ? undefined
        : mergePermits(existing?.permits ?? [], draft.permits),
  });
  return {
    ok: true,
    inserted: existing == null,
    slug: saved.slug,
    path: datacenterFacilityPath(saved.slug),
    url: datacenterFacilityUrl(saved.slug),
    sourceUrl: saved.sourceUrl,
    checkedAt: saved.checkedAt.toISOString(),
    updatedAt: saved.updatedAt.toISOString(),
    status: saved.status,
  };
}

function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function record(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function pick(body: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (body[key] !== undefined) return body[key];
  }
  return undefined;
}

function has(body: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => body[key] !== undefined);
}

function text(value: unknown, max: number): string {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function parseStatus(value: unknown): DatacenterStatus | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw === "planned") return "under-construction";
  if (raw === "operating") return "operational";
  if ((DATACENTER_STATUS as readonly string[]).includes(raw)) {
    return raw as DatacenterStatus;
  }
  return null;
}

function parseCoord(value: unknown, min: number, max: number): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

const invalid = Symbol("invalid");
const absent = Symbol("absent");

function parseMw(
  value: unknown,
  present: boolean,
): number | null | undefined | typeof invalid {
  if (!present) return undefined;
  if (value === null || value === "") return null;
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number) || number < 0) return invalid;
  return number;
}

function parseSlug(value: unknown): string | null | typeof invalid {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return invalid;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.length > 80 || !SLUG_PATTERN.test(trimmed)) return invalid;
  return trimmed;
}

function parseDay(
  value: unknown,
): string | null | typeof invalid | typeof absent {
  if (value === undefined) return absent;
  if (value === null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return invalid;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return invalid;
  const day = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return invalid;
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    return invalid;
  }
  return day;
}

function parsePermit(
  value: unknown,
  facilitySource: string,
): FacilityPermit | string {
  const body = record(value);
  if (!body) return "Each permit must be an object.";
  const kind = text(pick(body, ["kind"]), 40);
  if (!(PERMIT_KINDS as readonly string[]).includes(kind)) {
    return "permit kind is not recognised.";
  }
  const issuingBody = text(pick(body, ["issuingBody", "issuing_body"]), 200);
  if (!issuingBody) return "permit issuing body is required.";
  const statusRaw = pick(body, ["status"]);
  const status =
    statusRaw === undefined || statusRaw === null || statusRaw === ""
      ? "granted"
      : text(statusRaw, 40);
  if (!(PERMIT_STATUS as readonly string[]).includes(status)) {
    return "permit status is not recognised.";
  }
  const applied = parseDay(pick(body, ["appliedDate", "applied_date"]));
  if (applied === invalid) return "permit applied date must be YYYY-MM-DD.";
  const issued = parseDay(pick(body, ["issuedDate", "issued_date"]));
  if (issued === invalid) return "permit issued date must be YYYY-MM-DD.";
  const sourceRaw = pick(body, ["sourceUrl", "source_url"]);
  const sourceUrl =
    sourceRaw === undefined || sourceRaw === null || sourceRaw === ""
      ? facilitySource
      : httpsSourceUrl(sourceRaw);
  if (!sourceUrl) return "permit source_url must be an https URL.";
  return {
    kind: kind as PermitKind,
    issuingBody,
    status: status as PermitStatus,
    appliedDate: applied === absent ? null : applied,
    issuedDate: issued === absent ? null : issued,
    sourceUrl,
  };
}

function parseFacilityDraft(
  input: unknown,
): { ok: true; value: Draft } | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "Expected a facility object." };
  const name = text(pick(body, ["name"]), 200);
  if (!name) return { ok: false, error: "name is required." };
  const operator = text(pick(body, ["operator"]), 160);
  if (!operator || !slugify(operator)) {
    return { ok: false, error: "operator is required." };
  }
  const country = text(pick(body, ["country"]), 80);
  if (country.length < 2) return { ok: false, error: "country is required." };
  const cityPresent = has(body, ["city"]);
  const cityValue = text(pick(body, ["city"]), 120);
  const city = cityPresent ? cityValue || null : undefined;
  const lat = parseCoord(pick(body, ["lat", "latitude"]), -90, 90);
  if (lat == null) {
    return { ok: false, error: "lat must be a number from -90 to 90." };
  }
  const lng = parseCoord(pick(body, ["lng", "longitude"]), -180, 180);
  if (lng == null) {
    return { ok: false, error: "lng must be a number from -180 to 180." };
  }
  const capacityMw = parseMw(
    pick(body, ["capacityMw", "capacity_mw", "mw"]),
    has(body, ["capacityMw", "capacity_mw", "mw"]),
  );
  if (capacityMw === invalid) {
    return { ok: false, error: "capacity_mw must be a number or null." };
  }
  const status = parseStatus(pick(body, ["status"]));
  if (!status) {
    return {
      ok: false,
      error: `status must be one of: ${DATACENTER_STATUS.join(", ")}.`,
    };
  }
  const sourceUrl = httpsSourceUrl(pick(body, ["sourceUrl", "source_url"]));
  if (!sourceUrl) {
    return { ok: false, error: "source_url must be an https URL." };
  }
  const checkedAt = asDate(pick(body, ["checkedAt", "checked_at"]));
  if (!checkedAt) {
    return {
      ok: false,
      error: "checked_at is required and must be an ISO 8601 timestamp.",
    };
  }
  const requestedSlug = parseSlug(pick(body, ["slug"]));
  if (requestedSlug === invalid) {
    return {
      ok: false,
      error: "slug must be lowercase letters, numbers, and hyphens.",
    };
  }
  const permitsRaw = pick(body, ["permits"]);
  let permits: FacilityPermit[] | undefined;
  if (permitsRaw !== undefined) {
    if (!Array.isArray(permitsRaw)) {
      return { ok: false, error: "permits must be a list." };
    }
    permits = [];
    for (const entry of permitsRaw) {
      const permit = parsePermit(entry, sourceUrl);
      if (typeof permit === "string") return { ok: false, error: permit };
      permits.push(permit);
    }
  }
  return {
    ok: true,
    value: {
      name,
      operator,
      country,
      city,
      lat,
      lng,
      capacityMw,
      status,
      sourceUrl,
      checkedAt,
      requestedSlug,
      permits,
    },
  };
}

async function allocateSlug(
  draft: Draft,
  repo: FacilityRepo,
): Promise<string | { ok: false; error: string }> {
  if (draft.requestedSlug) {
    if (
      isReservedDatacenterSlug(draft.requestedSlug) ||
      (await repo.slugTaken(draft.requestedSlug))
    ) {
      return {
        ok: false,
        error: isReservedDatacenterSlug(draft.requestedSlug)
          ? "slug is reserved."
          : "slug is already used by another facility.",
      };
    }
    return draft.requestedSlug;
  }
  const bases = [
    slugify(draft.name),
    slugify(`${draft.operator} ${draft.name}`),
  ].filter((value) => value.length > 0);
  for (const base of bases) {
    const found = await firstFreeSlug(base, repo);
    if (found) return found;
  }
  return { ok: false, error: "Could not assign a slug." };
}

async function firstFreeSlug(
  base: string,
  repo: FacilityRepo,
): Promise<string | null> {
  const stem = base.slice(0, 80);
  if (
    stem &&
    !isReservedDatacenterSlug(stem) &&
    !(await repo.slugTaken(stem))
  ) {
    return stem;
  }
  for (let n = 2; n <= 20; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${stem.slice(0, 80 - suffix.length)}${suffix}`;
    if (
      SLUG_PATTERN.test(candidate) &&
      !isReservedDatacenterSlug(candidate) &&
      !(await repo.slugTaken(candidate))
    ) {
      return candidate;
    }
  }
  return null;
}
