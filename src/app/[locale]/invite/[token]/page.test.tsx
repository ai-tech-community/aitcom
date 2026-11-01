import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../../messages/en.json";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  landing: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth/server", () => ({ getSession: mocks.session }));
vi.mock("@/server/communities/referral-email/landing", () => ({
  loadInviteLanding: mocks.landing,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: "referral.guest",
    }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    src,
    alt,
    ...props
  }: React.ComponentProps<"img"> & { priority?: boolean }) => (
    <img {...props} src={src} alt={alt} />
  ),
}));
vi.mock("./redeem-client", () => ({
  RedeemInviteClient: ({
    token,
    attribution,
  }: {
    token: string;
    attribution: string;
  }) => (
    <div
      data-testid="redeem"
      data-token={token}
      data-attribution={attribution}
    />
  ),
}));
import Page from "./page";
const delivery = "d76b670f-e48c-4b47-a3ef-d809dff69096";
function page(query: Record<string, string> = {}) {
  return Page({
    params: Promise.resolve({ token: "opaque-code", locale: "fr" }),
    searchParams: Promise.resolve(query),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.landing.mockResolvedValue({
    kind: "valid",
    communityName: "AIT Amsterdam",
    communitySlug: "amsterdam",
    inviterName: "Maya",
    alreadyMember: false,
  });
});
describe("personal guest invitation entry", () => {
  it("explains who invited the guest before authentication", async () => {
    render(await page());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Maya invited you to AIT Amsterdam.",
    );
    expect(
      screen.getByRole("link", { name: "Join AIT Amsterdam" }),
    ).toBeVisible();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("keeps delivery, ref and campaign through signup and sign-in without a double locale", async () => {
    render(
      await page({
        delivery,
        ref: "opaque-code",
        utm_source: "member",
        utm_medium: "email",
        utm_campaign: "friend-invite",
        redirect: "https://evil.test",
      }),
    );
    for (const name of ["Join AIT Amsterdam", "Sign in"]) {
      const url = new URL(
        screen.getByRole("link", { name }).getAttribute("href")!,
        "https://www.aitcommunity.org",
      );
      expect(url.pathname).toBe("/api/referral-invites/start");
      expect(url.searchParams.get("code")).toBe("opaque-code");
      expect(url.searchParams.get("locale")).toBe("fr");
      expect(url.searchParams.get("delivery")).toBe(delivery);
      expect(url.searchParams.get("ref")).toBe("opaque-code");
      expect(url.searchParams.get("utm_campaign")).toBe("friend-invite");
      expect(url.searchParams.get("mode")).toBe(
        name === "Sign in" ? "signin" : "signup",
      );
      expect(url.searchParams.has("signupIntent")).toBe(false);
      expect(url.searchParams.has("redirect")).toBe(false);
    }
  });
  it("redeems only after explicit acceptance and authenticated return", async () => {
    mocks.session.mockResolvedValue({ user: { id: "friend" } });
    render(await page({ accept: "1", delivery, utm_medium: "email" }));
    expect(screen.getByTestId("redeem")).toHaveAttribute(
      "data-token",
      "opaque-code",
    );
    expect(
      screen.getByTestId("redeem").getAttribute("data-attribution"),
    ).toContain(`delivery=${delivery}`);
  });
  it("offers an existing member their community instead of another signup", async () => {
    mocks.session.mockResolvedValue({ user: { id: "friend" } });
    mocks.landing.mockResolvedValue({
      kind: "valid",
      communityName: "AIT Amsterdam",
      communitySlug: "amsterdam",
      inviterName: "Maya",
      alreadyMember: true,
    });
    render(await page());
    expect(
      screen.getByRole("link", { name: "Open AIT Amsterdam" }),
    ).toHaveAttribute("href", "/communities/amsterdam");
    expect(
      screen.queryByRole("link", { name: "Join AIT Amsterdam" }),
    ).toBeNull();
  });
  it("does not disclose inviter or community details when the grant is expired", async () => {
    mocks.landing.mockResolvedValue({ kind: "expired" });
    render(await page());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This invitation has expired.",
    );
    expect(screen.queryByText(/Maya/)).toBeNull();
  });
});
