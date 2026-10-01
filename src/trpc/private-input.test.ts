import { describe, expect, it } from "vitest";
import { carriesPrivateInput } from "./private-input";

describe("carriesPrivateInput", () => {
  it("spots a shared position", () => {
    expect(carriesPrivateInput({ sort: "near", near: { lat: 1, lng: 2 } })).toBe(
      true,
    );
  });

  it("leaves everything else on GET", () => {
    expect(carriesPrivateInput({ sort: "near", near: undefined })).toBe(false);
    expect(carriesPrivateInput({ q: "ml" })).toBe(false);
    expect(carriesPrivateInput(undefined)).toBe(false);
    expect(carriesPrivateInput("near")).toBe(false);
  });
});
