import { describe, expect, it } from "vitest";
import { sponsorHref, toHomeSponsor } from "./home-sponsor";

describe("sponsorHref", () => {
  it.each([
    ["https://acme.ai", "https://acme.ai/"],
    ["http://acme.ai/about", "http://acme.ai/about"],
    ["acme.ai", "https://acme.ai/"],
    ["  www.acme.ai  ", "https://www.acme.ai/"],
  ])("links %s", (website, href) => {
    expect(sponsorHref(website)).toBe(href);
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "#",
    "javascript:alert(1)",
    "mailto:hi@acme.ai",
    "acme",
    "not a website",
  ])("gives no link for %s", (website) => {
    expect(sponsorHref(website)).toBeNull();
  });
});

describe("toHomeSponsor", () => {
  it("keeps the populated logo's URL and a safe link", () => {
    expect(
      toHomeSponsor({
        id: 4,
        name: "Acme",
        website: "acme.ai",
        logo: { id: 9, url: "/media/acme.png" } as never,
      }),
    ).toEqual({
      id: 4,
      name: "Acme",
      href: "https://acme.ai/",
      logoUrl: "/media/acme.png",
    });
  });

  it("has no logo when only the logo's id came back, and no link without a website", () => {
    expect(
      toHomeSponsor({ id: 5, name: "Beta", website: null, logo: 12 }),
    ).toEqual({ id: 5, name: "Beta", href: null, logoUrl: null });
  });
});
