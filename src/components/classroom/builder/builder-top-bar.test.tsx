import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

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

import { BuilderTopBar, type BuilderTopBarProps } from "./builder-top-bar";

function renderBar(overrides: Partial<BuilderTopBarProps> = {}) {
  const props: BuilderTopBarProps = {
    slug: "hub",
    courseSlug: "intro-1",
    title: "Intro to agents",
    status: "draft",
    isPublic: false,
    saveStatus: "idle",
    savedAt: null,
    onRetry: vi.fn(),
    onReload: vi.fn(),
    previewing: false,
    onTogglePreview: vi.fn(),
    onPublish: vi.fn(),
    onUnpublish: vi.fn(),
    statusChanging: false,
    onOpenOutline: vi.fn(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BuilderTopBar {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("BuilderTopBar", () => {
  it("offers Publish for a draft", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(props.onPublish).toHaveBeenCalledTimes(1);
  });

  it("offers no publish control for an archived course", () => {
    renderBar({ status: "archived" });
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Published/ })).toBeNull();
  });

  it("shows when the work was saved, with the time as a <time>", () => {
    const savedAt = new Date();
    renderBar({ saveStatus: "saved", savedAt });
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("dateTime", savedAt.toISOString());
    expect(time?.parentElement).toHaveTextContent(/^Saved /);
  });

  it("explains a conflict and offers a reload", () => {
    const props = renderBar({ saveStatus: "conflict" });
    expect(screen.getByText(/changed somewhere else/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });

  it("offers a retry after a failed save", () => {
    const props = renderBar({ saveStatus: "error" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });
});
