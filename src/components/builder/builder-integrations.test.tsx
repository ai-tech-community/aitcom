import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import messages from "../../../messages/en.json";
import { BuilderIntegrations } from "./builder-integrations";

vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => true,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { agentState } = vi.hoisted(() => ({
  agentState: {
    data: null as null | {
      id: string;
      name: string;
      status: string;
    },
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    agentManagement: {
      getMyAgent: { useQuery: () => ({ ...agentState, isPending: false }) },
      getKeyInfo: {
        useQuery: () => ({
          isSuccess: true,
          data: {
            prefix: "ait_sk_demo",
            scopes: ["read"],
            createdAt: new Date("2026-11-27T12:00:00Z"),
            lastUsedAt: null,
          },
        }),
      },
    },
  },
}));

type Props = ComponentProps<typeof BuilderIntegrations>;

function action<T>(overrides: object = {}): T {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    ...overrides,
  } as T;
}

function renderIntegrations(overrides: Partial<Props> = {}) {
  const props: Props = {
    slug: "workbench-notes",
    query: {
      data: null,
      isPending: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    },
    connect: action(),
    selectCalendar: action(),
    toggle: action(),
    test: action(),
    disconnect: action(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <BuilderIntegrations {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("BuilderIntegrations", () => {
  it("keeps agent access available while Luma is unavailable", () => {
    const refetch = vi.fn();
    renderIntegrations({
      query: {
        data: undefined,
        isPending: false,
        isError: true,
        isSuccess: false,
        refetch,
      },
    });

    expect(
      screen.getByRole("link", { name: "Manage agent on your account" }),
    ).toHaveAttribute("href", "/dashboard/agent");
    expect(screen.getByText("No agent")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: messages.common.retry }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("uses the existing calendar selection action for multi-calendar accounts", () => {
    const { selectCalendar } = renderIntegrations({
      connect: action({
        data: {
          lumaUser: "Workbench",
          calendars: [
            { api_id: "one", name: "Public" },
            { api_id: "two", name: "Workshops" },
          ],
        },
      }),
    });

    fireEvent.change(screen.getByLabelText("Luma calendar to sync"), {
      target: { value: "two" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync this calendar" }));
    expect(selectCalendar.mutate).toHaveBeenCalledWith({
      communitySlug: "workbench-notes",
      calendarApiId: "two",
      calendarName: "Workshops",
    });
  });

  it("keeps the time of the last successful Luma check", () => {
    renderIntegrations({
      query: {
        data: {
          calendarApiId: "calendar",
          calendarName: "Workbench",
          isEnabled: true,
        } as NonNullable<Props["query"]["data"]>,
        isPending: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      },
      test: action({
        isSuccess: true,
        submittedAt: Date.UTC(2026, 10, 28, 12),
      }),
    });

    expect(screen.getByText(/Last check at/)).toHaveTextContent("12:00 PM");
  });
  it("shows the agent access summary and leaves key management on the account page", () => {
    agentState.data = {
      id: "agent",
      name: "Workbench agent",
      status: "active",
    };
    try {
      renderIntegrations();
      const access = screen.getByRole("region", {
        name: "Your agent can reach this community",
      });
      const summary = within(access);
      expect(access).toHaveAccessibleDescription("Your account");
      expect(
        summary.getByRole("link", { name: /Manage agent on your account/ }),
      ).toHaveAttribute("href", "/dashboard/agent");
      expect(summary.getByText("Workbench agent")).toBeVisible();
      expect(summary.getByText("Active key")).toBeVisible();
      expect(summary.queryByText("ait_sk_demo…")).toBeNull();
      expect(summary.queryByRole("button", { name: "Revoke key" })).toBeNull();
      expect(
        screen.getByRole("region", { name: "Luma Events" }),
      ).toHaveAccessibleDescription("This community");
    } finally {
      agentState.data = null;
    }
  });
});
