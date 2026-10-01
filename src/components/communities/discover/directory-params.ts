/**
 * The Explore page's filters as URL search params, so a search, place or
 * sort survives Back, refresh and a shared link. Shared by the server page
 * (to prefetch exactly what the client will ask for) and the client.
 */

import {
  DIRECTORY_SORTS,
  type DirectorySort,
} from "@/server/communities/directory";
import { MAX_STREET_HOUSES } from "./community-street-scene";

export type DirectoryParams = {
  q: string;
  place: string | null;
  sort: DirectorySort;
};

/** Page size of the "All communities" grid. */
export const DIRECTORY_PAGE_SIZE = 24;

const MAX_PARAM_LENGTH = 100;

type ParamReader = { get(key: string): string | null };

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, MAX_PARAM_LENGTH);
}

function isSort(value: string): value is DirectorySort {
  return (DIRECTORY_SORTS as readonly string[]).includes(value);
}

export function parseDirectoryParams(params: ParamReader): DirectoryParams {
  const sort = clean(params.get("sort"));
  return {
    q: clean(params.get("q")),
    place: clean(params.get("place")) || null,
    sort: isSort(sort) ? sort : "active",
  };
}

/** Writes `params` into `search`, leaving defaults out of the URL. */
export function writeDirectoryParams(
  search: URLSearchParams,
  params: DirectoryParams,
): URLSearchParams {
  const next = new URLSearchParams(search);
  const set = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set("q", clean(params.q) || null);
  set("place", params.place);
  set("sort", params.sort === "active" ? null : params.sort);
  return next;
}

/** The `communities.directory` input for the grid (without the cursor). */
export function gridQueryInput(params: DirectoryParams, locale: "en" | "nl") {
  return {
    q: params.q || undefined,
    place: params.place ?? undefined,
    sort: params.sort,
    limit: DIRECTORY_PAGE_SIZE,
    locale,
  };
}

/**
 * The `communities.directory` input for the square: the most active
 * communities, unfiltered, one per house the street can show.
 */
export function squareQueryInput(locale: "en" | "nl") {
  return {
    sort: "active" as const,
    limit: MAX_STREET_HOUSES,
    locale,
  };
}
