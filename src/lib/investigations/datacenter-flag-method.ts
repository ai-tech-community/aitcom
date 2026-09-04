/** Paths journalists cite. Do not invent others. */
export const LIVE_INVESTIGATION_PATH = "/investigations/datacenters";
export const METHOD_PATH = "/investigations/datacenters/method";

/**
 * Thresholds and formulas already used by
 * `datacenters.phase5RedFlags` and `datacenters.investigationStats`.
 * This module restates those rules; it does not compute live counts.
 */
export const SUBSIDY_PER_JOB_THRESHOLD_USD = 1_000_000;

export const CARBON_FREE_POWER_SOURCES = [
  "solar",
  "wind",
  "hydro",
  "geothermal",
  "nuclear",
] as const;

export const GREENWASH_GAP_THRESHOLD_PP = 30;

export const SUBSIDY_PER_JOB_FORMULA = "amount_usd / claimed_jobs > 1000000";
export const SUBSIDY_PER_JOB_APPLIES =
  "claimed_jobs IS NOT NULL AND claimed_jobs > 0 AND amount_usd IS NOT NULL";
export const SUBSIDY_PER_JOB_SOURCE = "app.subsidy";

export const NO_POWER_SOURCE_FORMULA =
  "verified = true AND primary_power_source IS NULL";
export const NO_POWER_SOURCE_TABLE = "app.datacenter";

export const GREENWASH_GAP_FORMULA =
  "gap_pp = commitment_pct − (carbon_free_mw / total_mw × 100)";
export const GREENWASH_GAP_FLAG_WHEN = "gap_pp >= 30";
export const GREENWASH_GAP_MW = "capacity_mw + capacity_mw_planned";
export const GREENWASH_GAP_SOURCE = "app.brand + app.datacenter";
