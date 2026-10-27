import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RouterOutputs } from "@/trpc/react";

import { renderWithIntl } from "../test-intl";

type Status = RouterOutputs["magazineSubscriptions"]["status"];
type MutationOptions = {
  onSuccess?: () => unknown;
  onError?: (error: unknown) => unknown;
};

const trpc = vi.hoisted(() => ({
  status: { signedIn: true, subscribed: false } as Status,
  nextStatus: null as Status | null,
  loading: false,
  error: false,
  query: vi.fn(),
  invalidate: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  subscribeByEmail: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/magazines/m",
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/trpc/react", async () => {
  const { useState } = await import("react");
  function useMutation(
    request: (input: unknown) => Promise<unknown>,
    options: MutationOptions,
  ) {
    const [isPending, setPending] = useState(false);
    return {
      isPending,
      mutate: (input: unknown) => {
        setPending(true);
        void request(input)
          .then(() => options.onSuccess?.())
          .catch((error: unknown) => options.onError?.(error))
          .finally(() => setPending(false));
      },
    };
  }
  return {
    api: {
      useUtils: () => ({
        magazineSubscriptions: { status: { invalidate: trpc.invalidate } },
      }),
      magazineSubscriptions: {
        status: {
          useQuery: (input: unknown) => {
            trpc.query(input);
            return {
              data: trpc.loading ? undefined : trpc.status,
              isLoading: trpc.loading,
              isError: trpc.error,
            };
          },
        },
        subscribe: {
          useMutation: (options: MutationOptions) =>
            useMutation(trpc.subscribe, options),
        },
        unsubscribe: {
          useMutation: (options: MutationOptions) =>
            useMutation(trpc.unsubscribe, options),
        },
        subscribeByEmail: {
          useMutation: (options: MutationOptions) =>
            useMutation(trpc.subscribeByEmail, options),
        },
      },
    },
  };
});

import { SubscribeButton } from "./subscribe-button";

const button = <SubscribeButton magazineSlug="m" magazineName="Monthly" />;
const emailHelp =
  "We send one email to check it is you. You can stop any time.";

beforeEach(() => {
  vi.resetAllMocks();
  trpc.status = { signedIn: true, subscribed: false };
  trpc.nextStatus = null;
  trpc.loading = false;
  trpc.error = false;
  trpc.subscribe.mockResolvedValue({ subscribed: true });
  trpc.unsubscribe.mockResolvedValue({ subscribed: false });
  trpc.subscribeByEmail.mockResolvedValue({ ok: true });
  trpc.invalidate.mockImplementation(() => {
    if (trpc.nextStatus) trpc.status = trpc.nextStatus;
    return Promise.resolve();
  });
});

function openEmailForm() {
  trpc.status = { signedIn: false, subscribed: false };
  renderWithIntl(button);
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
  return screen.getByLabelText("Your email address");
}

function sendEmail() {
  fireEvent.change(screen.getByLabelText("Your email address"), {
    target: { value: "ann@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send me a link" }));
}

describe("SubscribeButton", () => {
  it("a signed-in reader subscribes and the change is announced", async () => {
    trpc.nextStatus = { signedIn: true, subscribed: true };
    renderWithIntl(button);
    expect(trpc.query).toHaveBeenCalledWith({ magazineSlug: "m" });
    expect(
      screen.getByText(
        "Get a message in your inbox when there is a new issue.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(trpc.subscribe).toHaveBeenCalledExactlyOnceWith({
      magazineSlug: "m",
      locale: "en",
    });
    expect(
      await screen.findByRole("button", { name: "Subscribed" }),
    ).toHaveAttribute("data-variant", "outline");
    expect(screen.getByRole("status")).toHaveTextContent(
      "You are subscribed to Monthly.",
    );
    expect(trpc.invalidate).toHaveBeenCalledExactlyOnceWith({
      magazineSlug: "m",
    });
  });

  it("a subscribed reader can unsubscribe", async () => {
    trpc.status = { signedIn: true, subscribed: true };
    trpc.nextStatus = { signedIn: true, subscribed: false };
    renderWithIntl(button);
    const subscribed = screen.getByRole("button", { name: "Subscribed" });
    expect(subscribed.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const unsubscribe = screen.getByRole("button", { name: "Unsubscribe" });
    expect(unsubscribe).toHaveAttribute("data-variant", "ghost");
    fireEvent.click(unsubscribe);

    expect(trpc.unsubscribe).toHaveBeenCalledExactlyOnceWith({
      magazineSlug: "m",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You are no longer subscribed to Monthly.",
    );
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
    expect(trpc.invalidate).toHaveBeenCalledExactlyOnceWith({
      magazineSlug: "m",
    });
  });

  it("a signed-out reader asks for a link by email", async () => {
    trpc.status = { signedIn: false, subscribed: false };
    renderWithIntl(button);
    const disclose = screen.getByRole("button", { name: "Subscribe" });
    expect(disclose).toHaveAttribute("aria-expanded", "false");
    const controls = disclose.getAttribute("aria-controls")!;
    fireEvent.click(disclose);
    expect(disclose).toHaveAttribute("aria-expanded", "true");
    const email = screen.getByLabelText("Your email address");
    expect(email).toHaveFocus();
    expect(document.getElementById(controls)).toContainElement(email);
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    sendEmail();

    expect(trpc.subscribeByEmail).toHaveBeenCalledExactlyOnceWith({
      magazineSlug: "m",
      email: "ann@example.com",
      locale: "en",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email and click the link in it to start getting new issues.",
    );
    expect(screen.queryByLabelText("Your email address")).toBeNull();
  });

  it("explains when there were too many tries", async () => {
    trpc.subscribeByEmail.mockRejectedValue({
      data: { code: "TOO_MANY_REQUESTS" },
    });
    const email = openEmailForm();
    const helpId = email.getAttribute("aria-describedby")!;
    sendEmail();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Too many tries. Wait a while, then try again.",
    );
    expect(email).toHaveAttribute("aria-describedby", `${helpId} ${alert.id}`);
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Send me a link" }),
    ).toBeEnabled();
    expect(trpc.invalidate).not.toHaveBeenCalled();
  });

  it("ties the help text to the email field", () => {
    const email = openEmailForm();
    expect(
      document.getElementById(email.getAttribute("aria-describedby")!),
    ).toHaveTextContent(emailHelp);
    expect(email).toHaveAccessibleDescription(emailHelp);
    expect(email).not.toHaveAttribute("aria-invalid");
  });

  it("offers sign-in that comes back to this page", () => {
    openEmailForm();
    expect(
      screen.getByRole("link", {
        name: "Have an account? Sign in to get new issues in your inbox.",
      }),
    ).toHaveAttribute("href", "/auth/signin?redirect=/en/magazines/m");
  });

  it("is never the orange button", () => {
    for (const status of [
      { signedIn: true, subscribed: false },
      { signedIn: true, subscribed: true },
      { signedIn: false, subscribed: false },
    ]) {
      trpc.status = status;
      const { unmount } = renderWithIntl(button);
      if (!status.signedIn)
        fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
      for (const action of screen.getAllByRole("button")) {
        expect(action).toHaveAttribute("data-variant");
        expect(action).not.toHaveAttribute("data-variant", "default");
      }
      if (!status.subscribed)
        expect(
          screen.getByRole("button", { name: "Subscribe" }),
        ).toHaveAttribute("data-variant", "ink");
      unmount();
    }
  });

  it("shows a placeholder while loading and nothing on error", () => {
    trpc.loading = true;
    const { container, unmount } = renderWithIntl(button);
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    trpc.loading = false;
    trpc.error = true;
    const error = renderWithIntl(button);
    expect(error.container).toBeEmptyDOMElement();
  });

  it.each(["NOT_FOUND", "INTERNAL_SERVER_ERROR"])(
    "explains other email failures (%s)",
    async (code) => {
      trpc.subscribeByEmail.mockRejectedValue({ data: { code } });
      const email = openEmailForm();
      sendEmail();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That did not work. Try again.",
      );
      expect(email).toHaveAttribute("aria-invalid", "true");
    },
  );

  it("disables the email button while the request runs", async () => {
    let finish!: (result: { ok: true }) => void;
    trpc.subscribeByEmail.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    openEmailForm();
    sendEmail();
    expect(
      screen.getByRole("button", { name: "Send me a link" }),
    ).toBeDisabled();
    await act(async () => {
      finish({ ok: true });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Check your email");
  });

  it("gives each email disclosure its own labels and help", () => {
    trpc.status = { signedIn: false, subscribed: false };
    renderWithIntl(
      <>
        {button}
        {button}
      </>,
    );
    for (const disclose of screen.getAllByRole("button", { name: "Subscribe" }))
      fireEvent.click(disclose);
    const fields = screen.getAllByLabelText("Your email address");
    expect(fields[0]!.id).not.toBe(fields[1]!.id);
    for (const field of fields) {
      expect(
        within(field.closest("form")!).getByText(emailHelp),
      ).toHaveAttribute("id", field.getAttribute("aria-describedby"));
    }
  });
});
