import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

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

import en from "../../../messages/en.json";

import {
  UnsubscribeConfirm,
  type UnsubscribeCopy,
} from "./unsubscribe-confirm";

const copy: UnsubscribeCopy = {
  kicker: "Digest",
  title: "Unsubscribe from the weekly digest",
  body: "This stops the weekly digest.",
  action: "Unsubscribe",
  doneTitle: "You're unsubscribed",
  doneBody: "The weekly digest is off.",
  invalidTitle: "This unsubscribe link is not valid",
  invalidBody: "The link is missing or has been changed.",
  settings: "Notification settings",
};

function renderConfirm(status: "ready" | "done" | "invalid", token?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <UnsubscribeConfirm
        status={status}
        token={token}
        locale="en"
        copy={copy}
      />
    </NextIntlClientProvider>,
  );
}

describe("UnsubscribeConfirm", () => {
  it("asks before opting out and posts the token", () => {
    renderConfirm("ready", "signed-token");

    const label = document.querySelector('[data-slot="section-label"]');
    expect(label?.textContent).toBe("/ Digest");
    expect(label?.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "/ ",
    );
    expect(label?.classList.contains("uppercase")).toBe(true);
    expect(
      screen.getByRole("heading", {
        name: "Unsubscribe from the weekly digest",
      }),
    ).toBeTruthy();
    const form = document.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/email/unsubscribe");
    expect(form?.querySelector('input[name="t"]')?.getAttribute("value")).toBe(
      "signed-token",
    );
    expect(
      form?.querySelector('input[name="confirm"]')?.getAttribute("value"),
    ).toBe("unsubscribe");
    expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeTruthy();
  });

  it("shows success without a form", () => {
    renderConfirm("done");
    expect(
      screen.getByRole("heading", { name: "You're unsubscribed" }),
    ).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
  });

  it("does not offer the action for an invalid link", () => {
    renderConfirm("invalid", "garbage");
    expect(
      screen.getByRole("heading", {
        name: "This unsubscribe link is not valid",
      }),
    ).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Notification settings" }),
    ).toBeTruthy();
  });
});
