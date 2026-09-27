import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Footer } from "./footer";

function renderIn(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <Footer />
    </NextIntlClientProvider>,
  );
}

/** A neutral OKLCH token's lightness, read from a theme block of globals.css. */
function lightness(block: string, token: string): number {
  const match = new RegExp(`--${token}:\\s*oklch\\(([\\d.]+) 0 0\\)`).exec(
    block,
  );
  if (!match) throw new Error(`--${token} is not a neutral oklch()`);
  return Number(match[1]);
}

/**
 * WCAG contrast of two neutral OKLCH greys. For a grey, OKLab's l, m and s
 * are all L³, so the relative luminance is exactly L³.
 */
function contrast(a: number, b: number): number {
  const [hi, lo] = [a ** 3, b ** 3].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("Footer", () => {
  it("uses the dark token set in both themes", () => {
    renderIn();
    const footer = screen.getByRole("contentinfo");
    expect(footer.className).toMatch(/(^|\s)dark(\s|$)/);
    expect(footer.className).toMatch(/\bbg-background\b/);
    // No inverted tokens: they flipped the footer to near-white in dark mode.
    expect(footer.className).not.toMatch(
      /\bbg-foreground\b|\btext-background\b/,
    );
  });

  it("keeps muted footer text at 4.5:1 or more", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/globals.css"),
      "utf8",
    );
    const dark = /\.dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const ratio = contrast(
      lightness(dark, "muted-foreground"),
      lightness(dark, "background"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    // The old pairing (light muted grey on ink) was below the bar.
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(
      contrast(
        lightness(root, "muted-foreground"),
        lightness(root, "foreground"),
      ),
    ).toBeLessThan(4.5);
  });

  it("labels its columns with h2s that name their nav landmarks", () => {
    const { container } = renderIn();
    expect(container.querySelector("h3, h4, h5, h6")).toBeNull();
    const footer = screen.getByRole("contentinfo");
    const headings = within(footer).getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      `/ ${en.footer.navigation}`,
      `/ ${en.footer.connect}`,
      `/ ${en.footer.legal}`,
    ]);
    for (const name of [
      en.footer.navigation,
      en.footer.connect,
      en.footer.legal,
    ]) {
      expect(
        within(footer).getByRole("navigation", { name }),
      ).toBeInTheDocument();
    }
  });

  it("names the landmarks in Dutch on /nl", () => {
    renderIn("nl");
    expect(
      screen.getByRole("navigation", { name: nl.footer.legal }),
    ).toBeInTheDocument();
  });
});
