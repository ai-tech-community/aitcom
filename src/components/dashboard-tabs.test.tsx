import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardTabs } from "./dashboard-tabs";

const { mockUsePathname, mockUseTranslations } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUseTranslations: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

describe("DashboardTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/en/dashboard");
    mockUseTranslations.mockReturnValue((key: string) => key);
  });

  it("includes notifications in the dashboard navigation", () => {
    render(<DashboardTabs />);

    expect(screen.getByText("notifications")).toBeInTheDocument();
  });
});
