import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import nl from "../../../../../messages/nl.json";
import type { ConfirmLink } from "@/server/magazines/subscriptions/service";

const readConfirmLink = vi.hoisted(() => vi.fn());
const confirmEmailSubscription = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({}));
const payload = vi.hoisted(() => ({}));

vi.mock("@/server/db", () => ({ db }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));
vi.mock("@/server/magazines/subscriptions/service", () => ({
  readConfirmLink,
  confirmEmailSubscription,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespace as never,
    }),
}));
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

import ConfirmPage, { dynamic, generateMetadata } from "./page";

const magazine = { name: "Agents Weekly", slug: "agents-weekly" };

async function renderPage(
  t: string | string[] | undefined = "abc",
  locale: "en" | "nl" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "nl" ? nl : en}
    >
      {await ConfirmPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ t }),
      })}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  readConfirmLink.mockResolvedValue({
    status: "ready",
    magazine,
  } satisfies ConfirmLink);
});

describe("magazine subscription confirm page", () => {
  it("opening the link does not confirm", async () => {
    await renderPage();
    expect(dynamic).toBe("force-dynamic");
    expect(readConfirmLink).toHaveBeenCalledExactlyOnceWith(
      { db, payload },
      "abc",
      expect.any(Date),
    );
    expect(confirmEmailSubscription).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "Get new issues of Agents Weekly by email?",
      }),
    ).toBeTruthy();
    const form = document.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute(
      "action",
      "/api/magazine-subscriptions/confirm",
    );
    expect(form?.querySelector('input[name="t"]')).toHaveValue("abc");
    expect(form?.querySelector('input[name="locale"]')).toHaveValue("en");
    expect(
      screen.getByRole("button", { name: "Yes, email me new issues" }),
    ).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeTruthy();
  });

  it.each([
    ["subscribed", "You are subscribed"],
    ["expired", "This link is too old"],
    ["invalid", "This link does not work"],
  ] as const)(
    "shows the done, expired and invalid states (%s)",
    async (status, title) => {
      readConfirmLink.mockResolvedValue({ status, magazine });
      await renderPage();
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
      expect(document.querySelector("form")).toBeNull();
      expect(
        screen.getByRole("link", { name: "Go to Agents Weekly" }),
      ).toHaveAttribute("href", "/magazines/agents-weekly");
      expect(confirmEmailSubscription).not.toHaveBeenCalled();
    },
  );

  it("shows an invalid link without a magazine when none is known", async () => {
    readConfirmLink.mockResolvedValue({ status: "invalid", magazine: null });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "This link does not work" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a missing link as invalid without reading or confirming", async () => {
    await renderPage("");
    expect(readConfirmLink).not.toHaveBeenCalled();
    expect(confirmEmailSubscription).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "This link does not work" }),
    ).toBeTruthy();
  });

  it("renders the Dutch form and carries its locale", async () => {
    await renderPage(["abc", "ignored"], "nl");
    expect(
      screen.getByRole("heading", {
        name: "Nieuwe nummers van Agents Weekly per e-mail ontvangen?",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ja, mail me nieuwe nummers" }),
    ).toBeTruthy();
    expect(document.querySelector('input[name="locale"]')).toHaveValue("nl");
    expect(readConfirmLink).toHaveBeenCalledWith(
      { db, payload },
      "abc",
      expect.any(Date),
    );
  });

  it("is never indexed", async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("Confirm your subscription");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
