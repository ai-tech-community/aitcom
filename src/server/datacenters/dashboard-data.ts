import "server-only";

import { cache } from "react";

import { api } from "@/trpc/server";

/**
 * Request-scoped loaders for the datacenter investigation. The tab layout and
 * the active tab page both need these; `cache` makes them one query per request.
 */
export const getDatacenterStats = cache(() => api.datacenters.stats());

export const getInvestigationStats = cache(() =>
  api.datacenters.investigationStats(),
);
