import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { COMMUNITY_DESCRIPTION_MAX } from "@/lib/communities/description";

const mutate = vi.fn();

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ communities: { invalidate: vi.fn() } }),
    communities: {
      updateSettings: {
        useMutation: () => ({ mutate, isPending: false }),
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SettingsForm } from "./settings-form";

const initialData = {
  name: "Makers",
  description: "A long about.",
  logoUrl: null,
  bannerUrl: "https://cdn.example.test/banner.png",
  joinPolicy: "open" as const,
  isListedInDirectory: true,
  feedPostPolicy: "all_members" as const,
  newsSector: "ai" as const,
};

describe("SettingsForm", () => {
  it("keeps the description limit and the banner on the general settings form", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SettingsForm slug="makers" initialData={initialData} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Description")).toHaveAttribute(
      "maxLength",
      String(COMMUNITY_DESCRIPTION_MAX),
    );
    expect(
      screen.getByText(
        `Up to ${COMMUNITY_DESCRIPTION_MAX} characters. The full text is saved and shown.`,
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src="https://cdn.example.test/banner.png"]'),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload banner" })).toBeEnabled();
  });
});
