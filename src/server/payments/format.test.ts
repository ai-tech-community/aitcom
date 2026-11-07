import { describe, expect, it } from "vitest";
import { escapePaymentHtml, paymentCsvCell } from "./format";
describe("payment exports", () => {
  it("quotes values and neutralizes spreadsheet formulas", () => {
    expect(paymentCsvCell('Course, "AI"')).toBe('"Course, ""AI"""');
    expect(paymentCsvCell('=HYPERLINK("evil")')).toBe(
      '"\'=HYPERLINK(""evil"")"',
    );
    expect(paymentCsvCell("@SUM(1+1)")).toBe('"\'@SUM(1+1)"');
    expect(paymentCsvCell(1500)).toBe('"1500"');
  });
  it("escapes buyer-controlled receipt content", () => {
    expect(escapePaymentHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
});
