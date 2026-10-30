import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import type { StartupPublicCard } from "@/lib/investigations/startups";
import {
  STARTUP_SOURCED_ANSWERS,
  startupSourcedAnswer,
} from "@/lib/investigations/startup-sourced-answers";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/startups/elip-ai",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("./startups-map", () => ({
  StartupsMap: () => null,
}));

import { StartupsProfilePage } from "./startups-profile";
import { StartupSourcedAnswer } from "./startup-sourced-answer";

const dir = dirname(fileURLToPath(import.meta.url));
const PROFILE_ROUTE = join(dir, "../../app/[locale]/startups/[slug]/page.tsx");

const CARD: StartupPublicCard = {
  id: "elip",
  name: "Elip AI",
  homepage: "https://www.tryelip.ai",
  category: "vertical",
  sources: ["https://www.tryelip.ai"],
  region: "San Francisco, CA, USA",
  lat: null,
  lng: null,
  country: "US",
  stage: null,
  logoUrl: null,
  description:
    "A sourced description that is long enough to index this profile.",
  founders: [],
  investors: [],
  exitStatus: null,
  acquirer: null,
  exitOn: null,
  jobsUrl: null,
  listedOn: "2026-09-16",
  slug: "elip-ai",
  openRoleCount: 0,
};

function t(key: string) {
  return key;
}

describe("startup sourced answers", () => {
  it("covers the four profiles and gives every fact a source URL", () => {
    expect(STARTUP_SOURCED_ANSWERS.map((answer) => answer.slug)).toEqual([
      "elip-ai",
      "dtscout",
      "kueez",
      "salesplay-x",
    ]);

    for (const answer of STARTUP_SOURCED_ANSWERS) {
      expect(answer.statements.length).toBeGreaterThan(0);
      expect(answer.statements.some((fact) => fact.id === "does")).toBe(true);
      for (const fact of answer.statements) {
        expect(fact.text.trim().length).toBeGreaterThan(0);
        expect(fact.sourceUrl).toMatch(/^https:\/\/.+/);
        expect(fact.sourceLabel.trim().length).toBeGreaterThan(0);
        expect(fact.text).not.toMatch(/\$\s?\d/);
      }
    }

    expect(
      startupSourcedAnswer("dtscout")?.statements.map((fact) => fact.id),
    ).toEqual(["does"]);
    expect(
      startupSourcedAnswer("kueez")?.statements.map((fact) => fact.id),
    ).toEqual(["does", "founders"]);
    expect(startupSourcedAnswer("other-co")).toBeNull();
  });

  it("renders each fact with its source link", () => {
    for (const answer of STARTUP_SOURCED_ANSWERS) {
      const { container, unmount } = render(
        <StartupSourcedAnswer answer={answer} locale="en" />,
      );
      const block = container.querySelector("[data-startup-sourced-answer]");
      expect(block).not.toBeNull();
      for (const fact of answer.statements) {
        const row = block?.querySelector(`[data-sourced-fact="${fact.id}"]`);
        expect(row?.textContent).toContain(fact.text);
        expect(row?.querySelector("a")).toHaveAttribute("href", fact.sourceUrl);
      }
      unmount();
    }
  });

  it("is in the profile the startup route server-renders", () => {
    const { container } = render(
      <StartupsProfilePage locale="en" t={t} card={CARD} />,
    );
    const block = container.querySelector("[data-startup-sourced-answer]");
    expect(block?.textContent).toContain("Gaurav Luhariwala");
    expect(block?.querySelector('a[href*="ycombinator.com"]')).not.toBeNull();

    const route = readFileSync(PROFILE_ROUTE, "utf8");
    expect(route).toContain("startupProfileRobots");
    expect(route).toContain("localeAlternates");
    expect(route).not.toContain("startup-sourced-answer");
  });
});
