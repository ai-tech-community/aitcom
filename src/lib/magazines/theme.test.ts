import { expect, it } from "vitest";

import {
  DEFAULT_MAGAZINE_ACCENT,
  MAGAZINE_DARK_SURFACE,
  MAGAZINE_LIGHT_SURFACE,
  contrastRatio,
  magazineThemeIssue,
  normalizeHexColor,
  resolveMagazineTheme,
} from "./theme";

it("expands short hex and refuses anything that is not a hex color", () => {
  expect(normalizeHexColor(" #9a3 ")).toBe("#99AA33");
  expect(normalizeHexColor("#9A3412")).toBe("#9A3412");
  expect(normalizeHexColor("9A3412")).toBeNull();
  expect(normalizeHexColor("#xyzxyz")).toBeNull();
  expect(normalizeHexColor("red")).toBeNull();
});

it("accepts the default accent and a light accent that clears the dark page", () => {
  expect(magazineThemeIssue("journal", DEFAULT_MAGAZINE_ACCENT)).toBeNull();
  expect(
    contrastRatio(DEFAULT_MAGAZINE_ACCENT, MAGAZINE_LIGHT_SURFACE),
  ).toBeGreaterThanOrEqual(4.5);
  expect(magazineThemeIssue("fashion", "#F5E6D3")).toBeNull();
  expect(
    contrastRatio("#F5E6D3", MAGAZINE_DARK_SURFACE),
  ).toBeGreaterThanOrEqual(4.5);
});

it("refuses a mid gray and a pair that is not on the list", () => {
  expect(magazineThemeIssue("journal", "#808080")).toEqual(
    expect.stringContaining("contrast"),
  );
  expect(magazineThemeIssue("comic-sans", "#111111")).toEqual(
    expect.stringContaining("type pair"),
  );
  expect(magazineThemeIssue("journal", "orange")).toEqual(
    expect.stringContaining("hex"),
  );
});

it("renders a magazine with no theme as the journal pair", () => {
  const theme = resolveMagazineTheme(null);
  expect(theme.fontPair).toBe("journal");
  expect(theme.accent).toBe(DEFAULT_MAGAZINE_ACCENT);
  expect(
    contrastRatio(theme.inkOnLight, MAGAZINE_LIGHT_SURFACE),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrastRatio(theme.inkOnDark, MAGAZINE_DARK_SURFACE),
  ).toBeGreaterThanOrEqual(4.5);
});

it("keeps a passing accent and still gives the other surface a readable ink", () => {
  const theme = resolveMagazineTheme({
    fontPair: "fashion",
    accent: "#F4EDE4",
  });
  expect(theme.accent).toBe("#F4EDE4");
  expect(theme.inkOnDark).toBe("#F4EDE4");
  expect(
    contrastRatio(theme.inkOnLight, MAGAZINE_LIGHT_SURFACE),
  ).toBeGreaterThanOrEqual(4.5);
  expect(theme.inkOnLight).not.toBe("#F4EDE4");
});
