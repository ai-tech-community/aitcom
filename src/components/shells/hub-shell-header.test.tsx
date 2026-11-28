import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { HubShellHeader } from "./hub-shell-header";

const data = vi.hoisted(() => ({
  path: "/events/sample-event",
  spaces: [
    { data: [{ builtinSurface: "events", slug: "events" }] },
    { isError: true, data: [{ builtinSurface: "events", slug: "events" }] },
    { data: [{ builtinSurface: "forum", slug: "forum" }] },
  ],
  getSpaces: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => data.path,
  useRouter: () => ({ push: vi.fn() }),
  Link: ({
    href,
    onNavigate: _,
    ...props
  }: React.ComponentProps<"a"> & { onNavigate?: () => void }) => (
    <a href={href} {...props} />
  ),
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getMyCommunities: { useQuery: () => ({ data: undefined }) },
    },
    useQueries: (createQueries: (proxy: unknown) => unknown) => {
      createQueries({ spaces: { list: data.getSpaces } });
      return data.spaces;
    },
  },
}));
vi.mock("@/components/onboarding/onboarding-reminder", () => ({
  OnboardingReminderProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  OnboardingReminderRow: () => <button type="button">Getting started</button>,
}));
vi.mock("@/components/inbox/messages-nav-link", () => ({
  MessagesNavLink: () => <a href="/messages">Messages</a>,
}));
vi.mock("./shell-header", () => ({
  ShellHeader: ({
    location,
    leading,
    section,
    navigation,
    trailing,
  }: {
    location: string;
    leading: React.ReactNode;
    section: string;
    navigation: React.ReactNode;
    trailing: React.ReactNode;
  }) => (
    <header>
      {location}
      {leading}
      <span data-testid="section">{section}</span>
      {navigation}
      {trailing}
    </header>
  ),
}));
vi.mock("./shell-navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shell-navigation")>();
  return {
    ...actual,
    ShellDrawer: ({
      children,
    }: {
      children: (close: () => void) => React.ReactNode;
    }) => <div>{children(() => undefined)}</div>,
  };
});

describe("Hub shell header", () => {
  it("keeps Hub Events active and links to a permitted local Events space", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <HubShellHeader
          initialUser={{ id: "viewer" }}
          initialMemberships={[
            {
              slug: "workbench",
              name: "Workbench",
              role: "member",
              status: "active",
            },
            { slug: "failed", name: "Stale", role: "member", status: "active" },
            {
              slug: "archived",
              name: "Archived",
              role: "member",
              status: "active",
            },
            {
              slug: "pending",
              name: "Pending",
              role: "member",
              status: "pending_approval",
            },
          ]}
        />
      </NextIntlClientProvider>,
    );
    const [primary] = screen.getAllByRole("navigation", {
      name: "Hub navigation",
    });
    expect(
      within(primary!).getByRole("link", { name: "Events" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("section")).toHaveTextContent("Events");
    const hrefs = within(screen.getByRole("banner"))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/communities/workbench/events");
    expect(hrefs).toContain("/communities/workbench");
    expect(hrefs).not.toContain("/communities/failed/events");
    expect(hrefs).not.toContain("/communities/archived/events");
    expect(screen.getAllByRole("link", { name: "Messages" })).toHaveLength(1);
    expect(data.getSpaces).not.toHaveBeenCalledWith({ slug: "pending" });
  });
});
