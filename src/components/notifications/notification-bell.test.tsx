import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import { NotificationBell } from "./notification-bell";

const fixture = vi.hoisted(() => ({ count: 4 }));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "member" } } }) },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    notifications: {
      unreadCount: { useQuery: () => ({ data: { count: fixture.count } }) },
    },
  },
}));
vi.mock("./notification-panel", () => ({ NotificationPanel: () => null }));

it("uses the existing notifications count in both the bell label and badge", () => {
  const bell = () => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <NotificationBell compact signedIn />
    </NextIntlClientProvider>
  );
  const { rerender } = render(bell());
  expect(
    within(
      screen.getByRole("button", {
        name: "Notifications, 4 unread notifications",
      }),
    ).getByText("4"),
  ).toBeVisible();

  fixture.count = 0;
  rerender(bell());
  expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  expect(screen.queryByText("4")).toBeNull();
});
