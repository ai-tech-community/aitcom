import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import { MoreLink } from "./more-link";

describe("MoreLink", () => {
  it("is quiet but at least 24px tall", () => {
    render(<MoreLink href="/events">View all events</MoreLink>);
    const link = screen.getByRole("link", { name: "View all events" });
    expect(link).toHaveAttribute("href", "/events");
    expect(link.className).toMatch(/\binline-flex\b/);
    expect(link.className).toMatch(/\bmin-h-6\b/);
    expect(link.className).toMatch(/\btext-muted-foreground\b/);
    expect(link.className).toMatch(/\btext-xs\b/);
  });

  it("uses a straight arrow, never the external-link arrow", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/ui/more-link.tsx"),
      "utf8",
    );
    expect(source).toContain("ArrowRight");
    expect(source).not.toContain("ArrowUpRight");
  });
});
