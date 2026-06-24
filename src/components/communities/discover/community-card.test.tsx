import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/trpc/react", () => ({ api: {} })); // MemberStackView's module pulls trpc; keep it off the server
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
vi.mock("@/components/communities/member-stack", () => ({ MemberStackView: () => <div /> }));

import { CommunityCard } from "./community-card";

describe("CommunityCard", () => {
  it("links to the community page", () => {
    render(
      <CommunityCard slug="acme" name="ACME" description="Builders" logoUrl={null} memberCount={12} faces={[]} />,
    );
    const link = screen.getByRole("link", { name: /ACME/ });
    expect(link).toHaveAttribute("href", "/communities/acme");
  });
});
