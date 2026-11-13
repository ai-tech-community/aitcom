import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const { mutate, signOut } = vi.hoisted(() => ({
  mutate: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    members: {
      deleteAccount: {
        useMutation: () => ({
          mutate,
          isPending: false,
          isError: false,
          reset: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { signOut },
}));

import { DeleteAccountSettings } from "./delete-account-settings";

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <DeleteAccountSettings />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
  signOut.mockReset();
});

describe("Delete account settings", () => {
  it("asks for DELETE before it will erase the account", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Delete account",
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(confirm).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(mutate).toHaveBeenCalledWith({ confirmation: "DELETE" });
  });
});
