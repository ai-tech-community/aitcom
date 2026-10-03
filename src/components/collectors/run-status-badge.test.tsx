import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";

import { RunStatusBadge } from "./run-status-badge";

describe("RunStatusBadge", () => {
  it("shows a partial run as a warning badge with an icon and a label", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RunStatusBadge status="succeeded" stopReason="page_limit" />
      </NextIntlClientProvider>,
    );
    const badge = screen.getByText(en.collectors.status.partial);
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-variant", "warning");
    const icon = badge.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
