import { describe, expect, it } from "vitest";

import { ENTITY_CONFIG } from "./entity-config";
import {
  CitationRequiredError,
  FieldNotEditableError,
  AdminOnlyFieldError,
  validateFieldWhitelist,
  validateAdminOnlyFields,
  validateCitationRule,
} from "./validate";

const dcCfg = ENTITY_CONFIG.datacenter;

describe("validateFieldWhitelist", () => {
  it("accepts whitelisted fields", () => {
    expect(() =>
      validateFieldWhitelist(dcCfg, { name: "X", capacityMw: 100 }),
    ).not.toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() =>
      validateFieldWhitelist(dcCfg, { capacityMw: 100, fooBar: "x" }),
    ).toThrow(FieldNotEditableError);
  });
});

describe("validateAdminOnlyFields", () => {
  it("blocks admin-only field for non-admin", () => {
    expect(() =>
      validateAdminOnlyFields(dcCfg, { verified: true }, { isAdmin: false }),
    ).toThrow(AdminOnlyFieldError);
  });

  it("allows admin-only field for admin", () => {
    expect(() =>
      validateAdminOnlyFields(dcCfg, { verified: true }, { isAdmin: true }),
    ).not.toThrow();
  });

  it("ignores non-admin-only fields", () => {
    expect(() =>
      validateAdminOnlyFields(dcCfg, { capacityMw: 100 }, { isAdmin: false }),
    ).not.toThrow();
  });
});

describe("validateCitationRule", () => {
  it("requires sources on create", () => {
    expect(() =>
      validateCitationRule(dcCfg, "create", { name: "X" }, []),
    ).toThrow(CitationRequiredError);
  });

  it("accepts create with sources", () => {
    expect(() =>
      validateCitationRule(dcCfg, "create", { name: "X" }, [
        { url: "https://example.com" },
      ]),
    ).not.toThrow();
  });

  it("requires sources on update of factual field", () => {
    expect(() =>
      validateCitationRule(dcCfg, "update", { capacityMw: 100 }, []),
    ).toThrow(CitationRequiredError);
  });

  it("does not require sources on update of cosmetic field", () => {
    expect(() =>
      validateCitationRule(dcCfg, "update", { description: "tidy text" }, []),
    ).not.toThrow();
  });

  it("requires sources on update touching any factual field even if mixed", () => {
    expect(() =>
      validateCitationRule(
        dcCfg,
        "update",
        { description: "tidy", capacityMw: 100 },
        [],
      ),
    ).toThrow(CitationRequiredError);
  });
});
