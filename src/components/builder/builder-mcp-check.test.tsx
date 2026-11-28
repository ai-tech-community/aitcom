import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import { BuilderMcpCheck } from "./builder-mcp-check";

vi.mock("@/i18n/navigation", () => ({ Link: "a" }));

const { activity } = vi.hoisted(() => ({
  activity: { lastActiveAt: new Date("2026-11-28T11:00:00Z") },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    agentManagement: {
      getMyAgent: {
        useQuery: () => ({
          data: { id: "agent-1", lastActiveAt: activity.lastActiveAt },
        }),
      },
    },
  },
}));
vi.mock("./builder-key-controls", () => ({
  useBuilderKeyControls: () => ({
    activeKey: { createdAt: new Date("2026-11-28T12:00:00Z") },
  }),
}));

describe("BuilderMcpCheck", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers one retry and a key-management link after rejection", async () => {
    const request = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", request);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BuilderMcpCheck
          fullKey={null}
          agentId="agent-1"
          credentialsHref="#credentials"
        />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Saved agent API key"), {
      target: { value: "ait_sk_outdatedsecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("HTTP 401 · Key rejected");
    expect(alert).toHaveTextContent("Tried ait_sk_outdated…");
    expect(alert).toHaveTextContent("may be invalid, revoked, replaced");
    expect(alert).not.toHaveTextContent("outdatedsecret");

    const banner = within(alert.parentElement!);
    expect(
      screen.queryByRole("button", { name: "Check connection" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Rotate key" })).toBeNull();
    expect(banner.getByRole("link", { name: "Manage key" })).toHaveAttribute(
      "href",
      "#credentials",
    );
    fireEvent.click(banner.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it("waits for a call recorded after key issuance and reports its time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: 1,
          result: {
            protocolVersion: "2025-03-26",
            serverInfo: { name: "aitcommunity" },
          },
        }),
      ),
    );
    const check = () => (
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <BuilderMcpCheck
          fullKey="ait_sk_real"
          agentId="agent-1"
          credentialsHref="#credentials"
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(check());
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    expect(
      await screen.findByText("Waiting for your assistant’s first call"),
    ).toBeVisible();
    activity.lastActiveAt = new Date("2026-11-28T12:05:00Z");
    rerender(check());
    expect(screen.getByText(/Connected · Last agent call/)).toBeVisible();
    expect(screen.getByText(/12:05 PM/)).toHaveAttribute(
      "dateTime",
      "2026-11-28T12:05:00.000Z",
    );
  });
});
