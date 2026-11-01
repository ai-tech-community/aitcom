import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterOutputs } from "@/trpc/react";
import en from "../../../../messages/en.json";

type Workspace = RouterOutputs["referral"]["workspace"];
type Result = RouterOutputs["referral"]["sendInvites"];
const mocks = vi.hoisted(() => ({
  data: {} as Workspace,
  send: vi.fn(),
  link: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  writeText: vi.fn(),
  loading: false,
  error: false,
}));
vi.mock("@/trpc/react", async () => {
  const { useState } = await import("react");
  return {
    api: {
      useUtils: () => ({
        referral: { workspace: { invalidate: mocks.invalidate } },
      }),
      referral: {
        workspace: {
          useQuery: () => ({
            data: mocks.loading ? undefined : mocks.data,
            isLoading: mocks.loading,
            isError: mocks.error,
            refetch: mocks.refetch,
          }),
        },
        myLink: {
          useMutation: () => ({ mutateAsync: mocks.link, isPending: false }),
        },
        sendInvites: {
          useMutation: (options: {
            onSuccess: (result: Result) => void;
            onError: () => void;
          }) => {
            const [state, setState] = useState<{
              isPending: boolean;
              data?: Result;
            }>({ isPending: false });
            return {
              ...state,
              reset: () => setState({ isPending: false }),
              mutate: (input: unknown) => {
                setState({ isPending: true });
                void mocks
                  .send(input)
                  .then((data: Result) => {
                    setState({ isPending: false, data });
                    options.onSuccess(data);
                  })
                  .catch(() => {
                    setState({ isPending: false });
                    options.onError();
                  });
              },
            };
          },
        },
      },
    },
  };
});
import { ReferralPanel } from "./referral-panel";
function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReferralPanel slug="ait" />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.loading = false;
  mocks.error = false;
  mocks.data = {
    communityName: "AIT Community",
    senderName: "Maya",
    canSend: true,
    unavailableReason: null,
    remaining: 50,
    sent: 0,
    joined: 0,
    pending: 0,
    failed: 0,
    activated: 0,
  };
  mocks.send.mockResolvedValue({
    accepted: 2,
    sent: 2,
    pending: 0,
    failed: 0,
    skipped: 0,
    unsentEmails: [],
  });
  mocks.link.mockResolvedValue({ code: "safe-personal-code" });
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});
describe("Workspace referral composer", () => {
  it("shows real context, a quiet empty state and a matching personal email preview", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Good company starts with you.",
    );
    expect(
      screen.getByText("A good community starts with someone you know."),
    ).toBeVisible();
    const preview = screen.getByRole("article", {
      name: "What your friend receives",
    });
    expect(
      within(preview).getByText("Maya invited you to AIT Community"),
    ).toBeVisible();
    expect(within(preview).queryByRole("button")).toBeNull();
  });
  it("pastes and dedupes friends, then submits only normalized addresses", async () => {
    mount();
    const input = screen.getByLabelText("Friends’ email addresses");
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "ALEX@example.com; alex@example.com\nsam@example.com",
      },
    });
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Send invitations" }));
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          emails: ["alex@example.com", "sam@example.com"],
          slug: "ait",
          locale: "en",
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.invalidate).toHaveBeenCalledWith({ slug: "ait" }),
    );
    expect(screen.queryAllByRole("button", { name: /^Remove / })).toHaveLength(
      0,
    );
  });
  it("keeps invalid addresses editable and rejects oversize pasted lists", () => {
    mount();
    const input = screen.getByLabelText("Friends’ email addresses");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Remove or correct");
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove not-an-email" }),
    );
    fireEvent.paste(input, {
      clipboardData: {
        getData: () =>
          Array.from({ length: 11 }, (_, i) => `friend${i}@example.com`).join(
            ", ",
          ),
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("up to 10");
  });
  it("retains failed recipients and the same request identity on a network retry", async () => {
    mocks.send.mockRejectedValueOnce(new Error("lost response"));
    mount();
    fireEvent.change(screen.getByLabelText("Friends’ email addresses"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Remove sam@example.com" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    expect(mocks.send.mock.calls[0]![0].requestId).toBe(
      mocks.send.mock.calls[1]![0].requestId,
    );
  });
  it("retains only unsent addresses after a partial result", async () => {
    mocks.send.mockResolvedValue({
      accepted: 1,
      sent: 1,
      pending: 0,
      failed: 0,
      skipped: 1,
      unsentEmails: ["sam@example.com"],
    });
    mount();
    fireEvent.change(screen.getByLabelText("Friends’ email addresses"), {
      target: { value: "alex@example.com, sam@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitations" }));
    await screen.findByText(/1 addresses were already invited/);
    expect(
      screen.getByRole("button", { name: "Remove sam@example.com" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Remove alex@example.com" }),
    ).toBeNull();
  });
  it("disables live sending before launch while leaving link sharing usable", async () => {
    mocks.data.canSend = false;
    mocks.data.unavailableReason = "launch";
    mount();
    expect(
      screen.getByRole("button", { name: "Send invitations" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Friends’ email addresses")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy your invite link" }),
    );
    await waitFor(() =>
      expect(mocks.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/en/invite/safe-personal-code"),
      ),
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps a selectable link when clipboard access is unavailable", async () => {
    mocks.writeText.mockRejectedValue(new Error("denied"));
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy your invite link" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLInputElement>("textbox", {
          name: "Your personal invite link",
        }).value,
      ).toContain("/en/invite/safe-personal-code"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "copy the link manually",
    );
  });
  it("updates the email preview when a different invitation language is chosen", () => {
    mount();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Invitation language" }),
      { target: { value: "fr" } },
    );
    expect(
      screen.getByRole("article", { name: "What your friend receives" }),
    ).toHaveAttribute("lang", "fr");
    expect(
      screen.getByText("Un visage familier. Une nouvelle communauté."),
    ).toBeVisible();
  });
  it("distinguishes unavailable data from an empty invitation history", () => {
    mocks.error = true;
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t load your invitations.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
});
