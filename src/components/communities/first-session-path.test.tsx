import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/trpc/react", () => ({ api: {} }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${vars.name ?? ""}` : key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { FirstSessionPathCard } from "./first-session-path";

describe("FirstSessionPathCard", () => {
  it("tells a new member they are in and how to bring an agent", () => {
    render(
      <FirstSessionPathCard
        communityName="AIT Community"
        bringHref="/dashboard/agent"
      />,
    );

    expect(screen.getByText("youreIn:AIT Community")).toBeInTheDocument();
    expect(screen.getByText("line")).toBeInTheDocument();
    expect(screen.getByText("bringAgent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "bringAgentCta" })).toHaveAttribute(
      "href",
      "/dashboard/agent",
    );
    expect(screen.queryByText(/aibuku/i)).not.toBeInTheDocument();
  });
});
