import { describe, expect, it } from "vitest";
import { computeBrandWeight } from "./weighting";

describe("computeBrandWeight", () => {
  it("returns 1.0 when agreement meets median", () => {
    expect(
      computeBrandWeight({ agreementCount: 10, medianAgreement: 10 }),
    ).toBe(1.0);
  });

  it("down-weights single-user mentions when many users agree on other brands", () => {
    expect(
      computeBrandWeight({ agreementCount: 1, medianAgreement: 10 }),
    ).toBeCloseTo(0.1, 5);
  });

  it("caps weight at 1.0 even if agreement exceeds median", () => {
    expect(
      computeBrandWeight({ agreementCount: 20, medianAgreement: 10 }),
    ).toBe(1.0);
  });

  it("returns 1.0 when medianAgreement is 0 (insufficient data)", () => {
    expect(computeBrandWeight({ agreementCount: 1, medianAgreement: 0 })).toBe(
      1.0,
    );
  });
});
