import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-intl";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { BuilderTopBar } from "./builder-top-bar";

describe("BuilderTopBar", () => {
  it.each([
    { scheduledVia: "auto" as const, text: "Goes out by itself" },
    { scheduledVia: "schedule" as const, text: "Goes out" },
    { scheduledVia: null, text: "Goes out" },
  ])("names the $scheduledVia schedule", ({ scheduledVia, text }) => {
    const { container } = renderWithIntl(
      <BuilderTopBar
        communitySlug="night-owls"
        magazineName="The Gazette"
        issueNumber={2}
        status="scheduled"
        scheduledVia={scheduledVia}
        scheduledFor="2026-10-29T12:00:00.000Z"
        title="Summer"
        saveStatus="saved"
        saveError={null}
        onRetry={vi.fn()}
        onReload={vi.fn()}
        onPublish={vi.fn()}
        publishDisabled={false}
      />,
    );
    const line = container.querySelector("time")!;
    expect(line.textContent).toMatch(new RegExp(`^${text} `));
    if (scheduledVia !== "auto")
      expect(line).not.toHaveTextContent("by itself");
    expect(line).not.toHaveClass("font-mono");
    expect(line.querySelector(".font-mono")).toHaveTextContent(/2026/);
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });
});
