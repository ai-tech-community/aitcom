import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ComponentProps, type ReactNode } from "react";
import messages from "../../../messages/en.json";
import { BuilderWebhookForm } from "./builder-webhook-form";

vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

type Props = ComponentProps<typeof BuilderWebhookForm>;
type Webhook = NonNullable<Props["query"]["data"]>;
const destination = "https://example.com/webhook";
const webhook: Webhook = {
  id: "webhook",
  agentId: "agent",
  ownerId: "owner",
  url: destination,
  categories: ["inbox", "benchmark"],
  status: "active",
  hasSecret: true,
  isEnabled: true,
  cursor: null,
  consecutiveFailures: 0,
  consecutiveAgentEvents: 0,
  createdAt: new Date("2026-11-28T12:00:00Z"),
  updatedAt: null,
};

function action<T>(overrides: object = {}): T {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    submittedAt: Date.UTC(2026, 10, 28, 12),
    ...overrides,
  } as T;
}

function renderForm(overrides: Partial<Props> = {}) {
  const props: Props = {
    query: {
      data: webhook,
      isPending: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    },
    issuedSecret: null,
    onDismissSecret: vi.fn(),
    save: action(),
    test: action(),
    remove: action(),
    approve: action(),
    reject: action(),
    ...overrides,
  };

  function Form() {
    const [secret, setSecret] = useState(props.issuedSecret);
    return (
      <BuilderWebhookForm
        {...props}
        issuedSecret={secret}
        onDismissSecret={() => {
          setSecret(null);
          props.onDismissSecret();
        }}
        onRotated={(secret) => {
          setSecret(secret);
          props.onRotated?.(secret);
        }}
      />
    );
  }

  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>
        <Form />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return props;
}

describe("BuilderWebhookForm", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("tests the saved destination independently of an edit", () => {
    const { test } = renderForm();
    expect(screen.getByLabelText("Destination URL")).toHaveValue(destination);
    expect(screen.queryByText(destination, { exact: false })).toBeNull();
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://example.org/edited" },
    });
    expect(
      screen.getByText(
        "Tests use the saved destination. Save your changes to test the new URL.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));
    expect(test.mutate).toHaveBeenCalledWith();
  });

  it("saves an edited URL without dropping previously subscribed events", () => {
    const { save } = renderForm();
    expect(screen.getByRole("checkbox", { name: "Benchmarks" })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "https://example.org/edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(save.mutate).toHaveBeenCalledWith(
      {
        url: "https://example.org/edited",
        categories: ["inbox", "benchmark"],
      },
      expect.any(Object),
    );
  });

  it("keeps agent proposals behind human approval", () => {
    const { approve } = renderForm({
      query: {
        data: { ...webhook, status: "pending" },
        isPending: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      },
    });
    expect(screen.getByText("Awaiting approval")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Send test event" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Approve destination" }),
    );
    expect(approve.mutate).toHaveBeenCalledWith();
  });

  it("keeps a newly issued signing secret visible when refresh fails", () => {
    renderForm({
      query: {
        data: undefined,
        isPending: false,
        isError: true,
        isSuccess: false,
        refetch: vi.fn(),
      },
      issuedSecret: "preview-signing-secret",
    });
    expect(screen.getByText("preview-signing-secret")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t load the webhook",
    );
  });

  it("explains how to recover from a redirected test event", () => {
    renderForm({
      test: action({
        isError: true,
        error: { message: "Webhook test failed: redirects are not followed" },
      }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Last test at");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Save the final HTTPS destination",
    );
    expect(screen.getByText("Last test failed")).toBeVisible();
    expect(screen.queryByText("Connected")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Send test again" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Send test event" }),
    ).toBeNull();
  });
  it("keeps the saved secret out of the UI and offers replacement for unsupported categories", () => {
    renderForm({ agentId: "agent", rotationKey: "ait_sk_test" });
    fireEvent.click(screen.getByText("Signing and verification"));
    expect(
      screen.getByText(
        /Choose Remove webhook, re-enter those settings, then choose Save webhook/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText("The secret was shown when you created or rotated it."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /rotate/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Show signing secret" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy Webhook signing secret" }),
    ).toBeNull();
  });
  it("shows the receiver’s reason phrase when the test returns one", () => {
    const { test } = renderForm({
      test: action({
        isError: true,
        error: { message: "Webhook test failed: Service Unavailable" },
      }),
    });

    expect(screen.getByRole("alert").textContent).toMatch(
      /^Service Unavailable/,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("HTTP 503");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Make sure your receiver is running and returns 2xx",
    );
    fireEvent.click(screen.getByRole("button", { name: "Send test again" }));
    expect(test.mutate).toHaveBeenCalledOnce();
  });
  it("puts a supplied HTTP code before the recovery message", () => {
    renderForm({
      test: action({
        isError: true,
        error: { message: "Webhook test failed: HTTP 503 Service Unavailable" },
      }),
    });

    expect(screen.getByRole("alert").textContent).toMatch(
      /^HTTP 503 · Service Unavailable/,
    );
    expect(screen.getByText("HTTP 503")).toHaveClass("font-mono");
    expect(
      screen
        .getByRole("alert")
        .compareDocumentPosition(screen.getByLabelText("Destination URL")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Send test/ })).toHaveLength(
      1,
    );
  });

  it("rotates in place only for the current agent and the bearer endpoint’s event set", async () => {
    const request = vi.fn(async () => Response.json({ registered: true }));
    vi.stubGlobal("fetch", request);
    const onRotated = vi.fn();
    renderForm({
      agentId: "agent",
      rotationKey: "ait_sk_test",
      onRotated,
      query: {
        data: { ...webhook, categories: ["inbox"] },
        isPending: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn(),
      },
    });
    fireEvent.click(screen.getByText("Signing and verification"));
    expect(
      screen.getByRole("link", { name: "Verify webhook signatures" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "The secret was shown when you created or rotated it. Rotate to get a new one.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copy Webhook signing secret" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rotate secret" }));
    await waitFor(() => expect(onRotated).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith(
      "/api/agent/webhook",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer ait_sk_test",
        }),
        body: expect.any(String),
      }),
    );
    const body = JSON.parse(
      (request.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body).toEqual({
      url: destination,
      categories: ["inbox"],
      secret: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(onRotated).toHaveBeenCalledWith(body.secret);
    expect(screen.getAllByText(body.secret)).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Copy Webhook signing secret" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Rotate secret" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss secret" }));
    fireEvent.click(screen.getByText("Signing and verification"));
    fireEvent.click(screen.getByText("Signing and verification"));
    expect(screen.queryByText(body.secret)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy Webhook signing secret" }),
    ).toBeNull();
  });
});
