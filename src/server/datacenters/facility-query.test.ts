import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  facilitiesPageSchema,
  facilityOrderBy,
  facilityWhere,
  parseFacilitiesSearchParams,
} from "./facility-query";

const dialect = new PgDialect();

describe("parseFacilitiesSearchParams", () => {
  it("defaults to verified facilities, largest first, 25 per page", () => {
    expect(parseFacilitiesSearchParams({})).toMatchObject({
      sort: "capacity",
      dir: "desc",
      page: 1,
      pageSize: 25,
      includeUnverified: undefined,
    });
  });

  it("keeps the filter links other investigation pages already publish", () => {
    expect(
      parseFacilitiesSearchParams({
        country: "us",
        operator: "microsoft",
        supplier: "nvidia",
        ai: "1",
      }),
    ).toMatchObject({
      country: "US",
      operatorSlug: "microsoft",
      supplierSlug: "nvidia",
      aiOnly: true,
    });
  });

  it("falls back to defaults for invalid values instead of failing the page", () => {
    const parsed = parseFacilitiesSearchParams({
      status: "melting",
      power: "hamsters",
      country: "USA",
      sort: "vibes",
      dir: "sideways",
      page: "-2",
      size: "33",
      unverified: "yes",
    });
    expect(parsed).toMatchObject({
      status: undefined,
      powerSource: undefined,
      country: undefined,
      sort: "capacity",
      dir: "desc",
      page: 1,
      pageSize: 25,
      includeUnverified: undefined,
    });
  });

  it("gives a text column its natural direction when none is set", () => {
    expect(parseFacilitiesSearchParams({ sort: "name" }).dir).toBe("asc");
    expect(parseFacilitiesSearchParams({ sort: "name", dir: "desc" }).dir).toBe(
      "desc",
    );
  });

  it("ignores blank params such as ?status=", () => {
    expect(
      parseFacilitiesSearchParams({ status: "", q: "   ", operator: " " }),
    ).toMatchObject({
      status: undefined,
      q: undefined,
      operatorSlug: undefined,
    });
  });

  it("produces input the tRPC procedure accepts", () => {
    const parsed = parseFacilitiesSearchParams({
      q: "Amsterdam",
      status: "operational",
      page: "3",
      size: "100",
      sort: "suppliers",
    });
    expect(facilitiesPageSchema.safeParse(parsed).success).toBe(true);
  });
});

describe("facility SQL", () => {
  it("searches the operator name too, matching % and _ literally", () => {
    const where = facilityWhere({ q: "50%_off" });
    const { sql, params } = dialect.sqlToQuery(where!);
    expect(sql).toContain('"brand"."canonical_name" ilike');
    expect(params).toContain("%50\\%\\_off%");
  });

  it("hides unverified facilities unless asked", () => {
    expect(dialect.sqlToQuery(facilityWhere({})!).sql).toContain(
      '"datacenter"."verified" = $1',
    );
    expect(facilityWhere({ includeUnverified: true })).toBeUndefined();
  });

  it("sinks missing values and breaks ties so pages never overlap", () => {
    const [primary, ...tieBreakers] = facilityOrderBy("capacity", "asc");
    expect(dialect.sqlToQuery(primary!).sql).toMatch(
      /"datacenter"\."capacity_mw" ASC NULLS LAST$/,
    );
    expect(tieBreakers).toHaveLength(2);
  });

  it("orders status by lifecycle rather than alphabetically", () => {
    const { sql, params } = dialect.sqlToQuery(
      facilityOrderBy("status", "asc")[0]!,
    );
    expect(sql).toContain("array_position(ARRAY[");
    expect(params.slice(0, 3)).toEqual([
      "announced",
      "under-construction",
      "operational",
    ]);
  });
});
