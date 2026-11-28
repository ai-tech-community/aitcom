import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  redesigned: vi.fn<() => boolean>(),
  access: vi.fn(),
  page: vi.fn(),
  frame: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("Not found");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
  getFormatter: vi.fn(),
}));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: mocks.redesigned,
}));
vi.mock("@/server/members/profile-page", () => ({
  getMemberAgentAccess: mocks.access,
  getMemberAgentPage: mocks.page,
  requireMemberFrame: mocks.frame,
}));

import MemberAgentPage from "./page";

const params = Promise.resolve({ id: "member-id", locale: "en" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(null);
  mocks.page.mockResolvedValue(null);
  mocks.frame.mockResolvedValue({ kind: "setup" });
});

describe("Agent route access", () => {
  it("renders recovery and links back to the profile when the Agent tab is unavailable", async () => {
    mocks.redesigned.mockReturnValue(true);
    const html = renderToStaticMarkup(await MemberAgentPage({ params }));
    expect(html).toContain("notFound.title");
    expect(html).toContain('href="/members/member-id"');
    expect(mocks.access).toHaveBeenCalledWith("member-id");
    expect(mocks.frame).toHaveBeenCalledWith("member-id");
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("keeps hidden profiles behind the existing profile gate", async () => {
    mocks.redesigned.mockReturnValue(true);
    mocks.frame.mockRejectedValueOnce(new Error("Not found"));
    await expect(MemberAgentPage({ params })).rejects.toThrow("Not found");
  });

  it("uses the existing page load to determine flag-off access", async () => {
    mocks.redesigned.mockReturnValue(false);
    await expect(MemberAgentPage({ params })).rejects.toThrow("Not found");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.frame).toHaveBeenCalledWith("member-id");
    expect(mocks.page).toHaveBeenCalledWith("member-id");
  });
});
