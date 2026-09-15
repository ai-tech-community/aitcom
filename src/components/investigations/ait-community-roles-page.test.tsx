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
import { AWESOME_AI_OSS_REVIEW_PATH } from "@/lib/investigations/awesome-ai-oss";
import {
  AIT_COMMUNITY_ROLES_H1,
  AIT_COMMUNITY_ROLES_JOIN_HREF,
  AIT_COMMUNITY_ROLES_PATH,
  HUB_DM_PATH,
  HUB_PEOPLE_PATH,
  HUB_WELCOME_THREAD_PATH,
  OUTREACH_APPROVED_AT,
  resolveSeats,
  type ResolvedSeat,
} from "@/lib/investigations/ait-community-roles";
import {
  AitCommunityRolesPage,
  type AitCommunityRolesKey,
} from "./ait-community-roles-page";

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE_FILE = join(dir, "../../app/[locale]/roles/page.tsx");
const OLD_PAGE_FILE = join(
  dir,
  "../../app/[locale]/investigations/ait-community-roles/page.tsx",
);
const INDEX_FILE = join(dir, "../../app/[locale]/investigations/page.tsx");
const NAV_FILE = join(dir, "../navbar.tsx");
const SITEMAP_FILE = join(dir, "../../app/sitemap.ts");

function interpolate(template: string, values?: { days?: number }): string {
  if (values?.days == null) return template;
  const days = values.days;
  return template.replace(
    /\{days, plural, one \{# ([^}]+)\} other \{# ([^}]+)\}\}/,
    (_match, one, other) => (days === 1 ? `1 ${one}` : `${days} ${other}`),
  );
}

function tFrom(messages: typeof en.investigationsAitCommunityRoles) {
  return (key: AitCommunityRolesKey, values?: { days: number }) =>
    interpolate(messages[key], values);
}

function hrefsOf(container: HTMLElement) {
  return [...container.querySelectorAll("a")].map((node) =>
    node.getAttribute("href"),
  );
}

const BANNED = [
  /\bGreg\b/,
  /\/review/,
  /member count/i,
  /leden aantal/i,
  /\d+\s+(members|leden)\b/i,
];

describe("AIT Community roles route", () => {
  it("is an indexable top-level /roles page with www canonical helpers", () => {
    expect(AIT_COMMUNITY_ROLES_PATH).toBe("/roles");
    expect(existsSync(PAGE_FILE)).toBe(true);
    expect(existsSync(OLD_PAGE_FILE)).toBe(false);
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("AIT_COMMUNITY_ROLES_PATH");
    expect(src).toContain("localeAlternates");
    expect(src).toContain("robots: { index: true, follow: true }");
    expect(src).toContain("AitCommunityRolesPage");
    expect(src).not.toContain(AWESOME_AI_OSS_REVIEW_PATH);
    expect(src).not.toContain("/review");

    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    expect(sitemap).toContain('"/roles"');
    expect(sitemap).not.toContain("/investigations/ait-community-roles");

    const index = readFileSync(INDEX_FILE, "utf8");
    expect(index).not.toContain("AIT_COMMUNITY_ROLES_PATH");
    expect(index).not.toContain("/investigations/ait-community-roles");

    const nav = readFileSync(NAV_FILE, "utf8");
    expect(nav).toContain('href: "/roles"');
    expect(nav).toMatch(/href: "\/roles",[\s\S]*?primary: true/);
  });
});

describe("AIT Community roles page", () => {
  it("renders four seats, Reese Quinn on Outreach, and Claim→Join on empty rows", () => {
    const seats = resolveSeats(undefined, new Date(OUTREACH_APPROVED_AT));
    const { container } = render(
      <AitCommunityRolesPage
        t={tFrom(en.investigationsAitCommunityRoles)}
        seats={seats}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: AIT_COMMUNITY_ROLES_H1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hub host" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Awesome OSS curator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Outreach / campus" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Agent-pair challenger" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Reese Quinn")).toBeInTheDocument();
    expect(screen.getByText("90 days left")).toBeInTheDocument();
    expect(screen.queryByText("Ending soon")).not.toBeInTheDocument();

    const claims = screen.getAllByRole("link", { name: "Claim this seat" });
    expect(claims).toHaveLength(3);
    expect(AIT_COMMUNITY_ROLES_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join?utm_source=roles&utm_medium=web&utm_campaign=roles",
    );
    for (const claim of claims) {
      expect(claim).toHaveAttribute("href", AIT_COMMUNITY_ROLES_JOIN_HREF);
    }

    const hrefs = hrefsOf(container);
    expect(hrefs).not.toContain("/investigations");
    expect(hrefs).not.toContain("/investigations/ait-community-roles");
    expect(container.textContent).toContain(
      en.investigationsAitCommunityRoles.pathLead,
    );
    expect(hrefs).toContain(HUB_WELCOME_THREAD_PATH);
    expect(hrefs).toContain(HUB_PEOPLE_PATH);
    expect(hrefs).toContain(HUB_DM_PATH);
    expect(hrefs).not.toContain(AWESOME_AI_OSS_REVIEW_PATH);
    expect(hrefs.some((href) => href?.includes("/review"))).toBe(false);
    expect(container.textContent).not.toMatch(/Greg/);
    for (const pattern of BANNED) {
      expect(container.textContent ?? "").not.toMatch(pattern);
    }
  });

  it("hides the timer on empty seats and uses warning — not red — when ≤14 days", () => {
    const seats: ResolvedSeat[] = [
      {
        id: "hub-host",
        empty: true,
        holderName: null,
        agentName: null,
        approvedAt: null,
        termEndsAt: null,
        daysLeft: null,
        urgent: false,
      },
      {
        id: "awesome-oss-curator",
        empty: true,
        holderName: null,
        agentName: null,
        approvedAt: null,
        termEndsAt: null,
        daysLeft: null,
        urgent: false,
      },
      {
        id: "outreach-campus",
        empty: false,
        holderName: "Reese Quinn",
        agentName: null,
        approvedAt: OUTREACH_APPROVED_AT,
        termEndsAt: "2026-12-14T00:00:00.000Z",
        daysLeft: 14,
        urgent: true,
      },
      {
        id: "agent-pair-challenger",
        empty: true,
        holderName: null,
        agentName: null,
        approvedAt: null,
        termEndsAt: null,
        daysLeft: null,
        urgent: false,
      },
    ];

    const { container } = render(
      <AitCommunityRolesPage
        t={tFrom(en.investigationsAitCommunityRoles)}
        seats={seats}
      />,
    );

    expect(screen.getByText("14 days left")).toBeInTheDocument();
    expect(screen.getByText("Ending soon")).toBeInTheDocument();
    expect(container.querySelector('[data-variant="warning"]')).not.toBeNull();
    expect(container.querySelector('[data-variant="destructive"]')).toBeNull();
    expect(screen.queryByText("0 days left")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Claim this seat" }),
    ).toHaveLength(3);
  });

  it("swaps empty-seat Claim off the hard Join door for signed-in Hub members", () => {
    const seats = resolveSeats(undefined, new Date(OUTREACH_APPROVED_AT));
    const { container } = render(
      <AitCommunityRolesPage
        t={tFrom(en.investigationsAitCommunityRoles)}
        seats={seats}
        promoteJoin={false}
      />,
    );

    expect(hrefsOf(container)).not.toContain(AIT_COMMUNITY_ROLES_JOIN_HREF);
    const claims = screen.getAllByRole("link", { name: "Claim this seat" });
    expect(claims).toHaveLength(3);
    for (const claim of claims) {
      expect(claim).toHaveAttribute("href", HUB_WELCOME_THREAD_PATH);
    }
    expect(hrefsOf(container)).toContain(HUB_WELCOME_THREAD_PATH);
    expect(hrefsOf(container)).toContain(HUB_PEOPLE_PATH);
    expect(hrefsOf(container)).toContain(HUB_DM_PATH);
    expect(container.textContent).not.toContain(
      en.investigationsAitCommunityRoles.pathLead,
    );
    expect(container.textContent).not.toContain("After you join");
    expect(container.textContent).not.toContain(
      en.investigationsAitCommunityRoles.joinHint,
    );
    expect(container.textContent).not.toMatch(/Joining is Hub/i);
    expect(container.textContent).toContain(
      en.investigationsAitCommunityRoles.memberHint,
    );
  });

  it("wires Roles to the shared promote-Join helper and Hub session seed", () => {
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("loadHubAuthSeed");
    expect(src).toContain("shouldPromoteJoin");
    expect(src).toContain("promoteJoin");
  });

  it("has matching EN and NL keys without invented headcount", () => {
    const enKeys = Object.keys(en.investigationsAitCommunityRoles).sort();
    const nlKeys = Object.keys(nl.investigationsAitCommunityRoles).sort();
    expect(nlKeys).toEqual(enKeys);
    expect(en.investigationsAitCommunityRoles.title).toBe(
      AIT_COMMUNITY_ROLES_H1,
    );
    expect(en.investigationsAitCommunityRoles.claimCta).toBe("Claim this seat");
    expect(en.nav.roles).toBe("Roles");
    expect(nl.nav.roles).toBe("Rollen");

    for (const messages of [
      en.investigationsAitCommunityRoles,
      nl.investigationsAitCommunityRoles,
    ]) {
      const blob = Object.values(messages).join("\n");
      expect(blob).not.toMatch(/Greg/);
      expect(blob).not.toMatch(/\/review/);
      for (const pattern of BANNED) {
        expect(blob).not.toMatch(pattern);
      }
    }
  });
});
