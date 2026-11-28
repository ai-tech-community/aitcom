import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MessagesNavLink } from "./messages-nav-link";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/communities/workbench-notes/spaces/show-your-work",
  Link: ({ href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "viewer" } } }) },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    inbox: { totalUnreadCount: { useQuery: () => ({ data: { count: 2 } }) } },
  },
}));
vi.mock("@/components/shells/shell-unread", () => ({
  useShellUnread: () => ({ messages: 2, messagesIncludeRooms: false }),
}));
vi.mock("@/components/shells/unread-badge", () => ({
  ShellUnreadBadge: () => null,
}));

it("takes the shell count to unread and keeps the originating community", () => {
  render(<MessagesNavLink presentation="desktop" />);
  expect(
    screen.getByRole("link", { name: "messages, unreadConversations" }),
  ).toHaveAttribute(
    "href",
    "/messages?fromCommunity=workbench-notes&view=unread",
  );
});

it("keeps the legacy Messages destination", () => {
  render(<MessagesNavLink />);
  expect(
    screen.getByRole("link", { name: "messages, 2 unread" }),
  ).toHaveAttribute("href", "/messages");
});
