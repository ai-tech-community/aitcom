import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  CARBON_FREE_POWER_SOURCES,
  GREENWASH_GAP_FLAG_WHEN,
  GREENWASH_GAP_FORMULA,
  GREENWASH_GAP_THRESHOLD_PP,
  LIVE_INVESTIGATION_PATH,
  METHOD_PATH,
  NO_POWER_SOURCE_FORMULA,
  SUBSIDY_PER_JOB_FORMULA,
  SUBSIDY_PER_JOB_THRESHOLD_USD,
} from "@/lib/investigations/datacenter-flag-method";
import { MethodGuide } from "./method-guide";

const dir = dirname(fileURLToPath(import.meta.url));
const METHOD_PAGE = join(
  dir,
  "../../app/[locale]/investigations/datacenters/method/page.tsx",
);
const PARENT_PAGE = join(
  dir,
  "../../app/[locale]/investigations/datacenters/page.tsx",
);
const ROUTER = join(dir, "../../server/api/routers/datacenters.ts");

/** Accusation / editorial language this cite page must not use. */
const BANNED = [
  /\bfraud(?:ulent)?\b/i,
  /\bcriminal(?:ity)?\b/i,
  /\bcorrupt(?:ion|ed)?\b/i,
  /\bscam(?:ming)?\b/i,
  /\billegal\b/i,
  /\blaunder(?:ing|ed)?\b/i,
  /\bbrib(?:e|ery|ed)\b/i,
  /\bguilty\b/i,
  /\bliar\b/i,
  /\bcheat(?:ed|ing)?\b/i,
  /\bstolen\b/i,
  /\bcover-?up\b/i,
  /\btax dodge\b/i,
  /\bcooked the books\b/i,
  /\bfraude\b/i,
  /\boplichting\b/i,
  /\bcrimineel\b/i,
  /\bcorruptie\b/i,
  /\billegaal\b/i,
];

function tFrom(messages: typeof en.datacenterMethod) {
  return (key: string) => messages[key as keyof typeof messages];
}

function methodMessages() {
  return {
    en: (en as { datacenterMethod?: typeof en.datacenterMethod })
      .datacenterMethod,
    nl: (nl as { datacenterMethod?: typeof nl.datacenterMethod })
      .datacenterMethod,
  };
}

describe("datacenters method cite page", () => {
  it("exists at the stable locale-routed path", () => {
    expect(existsSync(METHOD_PAGE)).toBe(true);
    const src = readFileSync(METHOD_PAGE, "utf8");
    expect(src).toContain(METHOD_PATH);
    expect(src).toContain("datacenterMethod");
  });

  it("is linked from the live investigation as Method / How we flag", () => {
    const src = readFileSync(PARENT_PAGE, "utf8");
    expect(src).toContain(METHOD_PATH);
    expect(src).toMatch(/How we flag|Method/);
  });

  it("documents the three Pulse flags from the live computation", () => {
    expect(SUBSIDY_PER_JOB_THRESHOLD_USD).toBe(1_000_000);
    expect(SUBSIDY_PER_JOB_FORMULA).toContain("1000000");
    expect(NO_POWER_SOURCE_FORMULA).toContain("primary_power_source IS NULL");
    expect(GREENWASH_GAP_THRESHOLD_PP).toBe(30);
    expect(GREENWASH_GAP_FLAG_WHEN).toContain("30");
    expect(GREENWASH_GAP_FORMULA).toMatch(/commitment_pct/);
    expect([...CARBON_FREE_POWER_SOURCES]).toEqual([
      "solar",
      "wind",
      "hydro",
      "geothermal",
      "nuclear",
    ]);

    const { en: enMethod } = methodMessages();
    expect(enMethod).toBeDefined();
    render(<MethodGuide t={tFrom(enMethod!)} />);

    expect(
      screen.getByRole("heading", { name: enMethod!.subsidyTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: enMethod!.powerTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: enMethod!.greenwashTitle }),
    ).toBeInTheDocument();

    expect(screen.getByText(SUBSIDY_PER_JOB_FORMULA)).toBeInTheDocument();
    expect(screen.getByText(NO_POWER_SOURCE_FORMULA)).toBeInTheDocument();
    expect(screen.getByText(GREENWASH_GAP_FORMULA)).toBeInTheDocument();
    expect(screen.getByText(enMethod!.subsidyWarrants)).toBeInTheDocument();
    expect(screen.getByText(enMethod!.powerWarrants)).toBeInTheDocument();
    expect(screen.getAllByText(/solar/).length).toBeGreaterThan(0);

    const live = screen.getByRole("link", { name: enMethod!.liveLink });
    expect(live).toHaveAttribute("href", LIVE_INVESTIGATION_PATH);
  });

  it("keeps descriptive, not editorial, language", () => {
    const { en: enMethod } = methodMessages();
    const { container } = render(<MethodGuide t={tFrom(enMethod!)} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/descriptive/i);
    expect(text).toMatch(/not (editorial|accusations)/i);
    const withoutDisclaimer = text.replace(/not accusations?/gi, "");
    for (const pattern of BANNED) {
      expect(withoutDisclaimer).not.toMatch(pattern);
    }
  });
});

describe("datacenter method i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    const { en: enMethod, nl: nlMethod } = methodMessages();
    expect(enMethod).toBeDefined();
    expect(nlMethod).toBeDefined();
    expect(Object.keys(nlMethod!).sort()).toEqual(
      Object.keys(enMethod!).sort(),
    );

    for (const messages of [enMethod!, nlMethod!]) {
      expect(messages.title.trim().length).toBeGreaterThan(0);
      expect(messages.lead.trim().length).toBeGreaterThan(0);
      expect(messages.subsidyTitle).toMatch(/\$1M|1M/);
      expect(messages.powerTitle.toLowerCase()).toMatch(/power|stroom/);
      expect(messages.greenwashTitle.toLowerCase()).toMatch(/greenwash/);
      const blob = Object.values(messages).join("\n");
      const withoutDisclaimer = blob.replace(/not accusations?/gi, "");
      for (const pattern of BANNED) {
        expect(withoutDisclaimer).not.toMatch(pattern);
      }
    }
  });
});

describe("method rules match live investigation SQL", () => {
  it("restates the same thresholds already used in datacenters.ts", () => {
    const src = readFileSync(ROUTER, "utf8");
    expect(src).toContain("(amount_usd / NULLIF(claimed_jobs, 0)) > 1000000");
    expect(src).toContain("primary_power_source IS NULL");
    expect(src).toContain("(g.gap_pp ?? 0) >= 30");
    expect(src).toContain(
      "d.primary_power_source IN ('solar','wind','hydro','geothermal','nuclear')",
    );
  });
});
