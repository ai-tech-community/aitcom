import { describe, expect, it } from "vitest";
import {
  cleanPersonName,
  hasAccountNames,
  personNameSchema,
  suggestNameParts,
} from "./person-name";

describe("cleanPersonName", () => {
  it("trims and collapses inner spaces", () => {
    expect(cleanPersonName("  Jan   van der  Berg ")).toBe("Jan van der Berg");
  });
});

describe("personNameSchema", () => {
  it("accepts a cleaned name", () => {
    expect(personNameSchema.parse("  Ada ")).toBe("Ada");
  });

  it("refuses empty and over-long names", () => {
    expect(personNameSchema.safeParse("   ").success).toBe(false);
    expect(personNameSchema.safeParse("x".repeat(101)).success).toBe(false);
    expect(personNameSchema.safeParse("x".repeat(100)).success).toBe(true);
  });
});

describe("suggestNameParts", () => {
  it("splits on the first space, keeping the rest as the last name", () => {
    expect(suggestNameParts("Jan van der Berg")).toEqual({
      firstName: "Jan",
      lastName: "van der Berg",
    });
  });

  it("puts a single word in the first name", () => {
    expect(suggestNameParts("octocat")).toEqual({
      firstName: "octocat",
      lastName: "",
    });
  });

  it("gives empty parts for no name", () => {
    expect(suggestNameParts(null)).toEqual({ firstName: "", lastName: "" });
    expect(suggestNameParts("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("hasAccountNames", () => {
  it("needs both names, not just spaces", () => {
    expect(hasAccountNames({ firstName: "Ada", lastName: "Lovelace" })).toBe(
      true,
    );
    expect(hasAccountNames({ firstName: "Ada", lastName: null })).toBe(false);
    expect(hasAccountNames({ firstName: " ", lastName: "L" })).toBe(false);
    expect(hasAccountNames({})).toBe(false);
  });
});
