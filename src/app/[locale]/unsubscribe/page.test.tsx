import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { signUnsubscribeToken } from "@/server/notifications/unsubscribe-token";

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

import UnsubscribePage, { generateMetadata } from "./page";

const SECRET = "unsubscribe-page-secret";
type Query = {
  t?: string | string[];
  done?: string | string[];
  kind?: string | string[];
};
const params = Promise.resolve({ locale: "en" });

beforeEach(() => {
  vi.stubEnv("DIGEST_UNSUBSCRIBE_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

async function renderPage(query: Query) {
  return render(
    await UnsubscribePage({ params, searchParams: Promise.resolve(query) }),
  );
}
const magazineToken = () =>
  signUnsubscribeToken(
    { subscriptionId: "subscription-1", scope: "magazine" },
    SECRET,
  );

describe("unsubscribe page", () => {
  it("uses the magazine words and no settings link for a magazine link", async () => {
    await renderPage({ t: magazineToken() });
    expect(
      screen.getByRole("heading", { name: "Stop emails from this magazine?" }),
    ).toBeTruthy();
    expect(
      screen.getByText("You will not get an email about new issues any more."),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("form")).toHaveAttribute(
      "action",
      "/api/email/unsubscribe",
    );
  });

  it("titles the tab for a magazine link", async () => {
    for (const query of [
      { t: magazineToken() },
      { done: "1", kind: "magazine" },
    ]) {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve(query),
      });
      expect(metadata.title).toBe("Stop magazine emails");
      expect(metadata.robots).toEqual({ index: false, follow: false });
    }
  });

  it("shows the finished magazine words without a form or settings link", async () => {
    await renderPage({ done: ["1"], kind: ["magazine"] });
    expect(
      screen.getByRole("heading", { name: "You are unsubscribed" }),
    ).toBeTruthy();
    expect(
      screen.getByText("We will not email you about this magazine again."),
    ).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps the digest page as it was", async () => {
    const t = signUnsubscribeToken(
      { userId: "user-1", scope: "digest" },
      SECRET,
    );
    await renderPage({ t });
    expect(
      screen.getByRole("heading", { name: en.digestUnsubscribe.title }),
    ).toBeTruthy();
    expect(screen.getByText(en.digestUnsubscribe.body)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: en.digestUnsubscribe.settings }),
    ).toBeTruthy();
    expect(
      (await generateMetadata({ searchParams: Promise.resolve({ t }) })).title,
    ).toBe(en.digestUnsubscribe.metaTitle);
  });

  it("keeps story words and settings for a story link", async () => {
    const t = signUnsubscribeToken(
      { userId: "user-1", scope: "story" },
      SECRET,
    );
    await renderPage({ t });
    expect(
      screen.getByRole("heading", { name: en.storyUnsubscribe.title }),
    ).toBeTruthy();
    expect(screen.getByText(en.storyUnsubscribe.body)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: en.storyUnsubscribe.settings }),
    ).toBeTruthy();
    expect(
      (await generateMetadata({ searchParams: Promise.resolve({ t }) })).title,
    ).toBe(en.storyUnsubscribe.metaTitle);
  });

  it("does not let an unverified kind choose magazine copy before completion", async () => {
    await renderPage({ t: "invalid", kind: "magazine" });
    expect(
      screen.getByRole("heading", { name: en.digestUnsubscribe.invalidTitle }),
    ).toBeTruthy();
    expect(
      (
        await generateMetadata({
          searchParams: Promise.resolve({ kind: "magazine" }),
        })
      ).title,
    ).toBe(en.digestUnsubscribe.metaTitle);
  });
});
