import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { DATACENTER_STATUS, POWER_SOURCE } from "@/server/db/schema";
import { FACILITY_SORT_KEYS } from "./facilities-query";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("datacenterInvestigation messages", () => {
  const enMessages = en.datacenterInvestigation;
  const nlMessages = nl.datacenterInvestigation;

  it("has the same keys in English and Dutch", () => {
    expect(keyPaths(nlMessages).sort()).toEqual(keyPaths(enMessages).sort());
  });

  it("labels every facility status, power source and table column", () => {
    for (const messages of [enMessages, nlMessages]) {
      for (const status of DATACENTER_STATUS) {
        expect(messages.status[status], status).toBeTruthy();
      }
      for (const power of POWER_SOURCE) {
        expect(messages.powerSource[power], power).toBeTruthy();
      }
      for (const column of FACILITY_SORT_KEYS) {
        expect(messages.facilities.columns[column], column).toBeTruthy();
      }
    }
  });
});
