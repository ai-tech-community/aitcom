import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

type Usage = { fileBytesStored: number; fileBytesAllowed: number };
const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  usage: { data: undefined } as {
    data?: Usage;
    isError?: boolean;
    refetch?: () => void;
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ communities: { getBySlug: { invalidate: vi.fn() } } }),
    communities: {
      getBySlug: {
        useQuery: () => ({
          data: {
            classroomCreatePolicy: "all_members",
            classroomUploadPolicy: "admins_only",
          },
          isLoading: false,
        }),
      },
      updateSettings: {
        useMutation: () => ({ mutate: m.mutate, isPending: false }),
      },
    },
    classroomMaterials: { usage: { useQuery: () => m.usage } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ClassroomSettings } from "./classroom-settings";

const settings = en.communities.settings.classroom;

function renderSettings() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClassroomSettings slug="town" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.usage = {
    data: { fileBytesStored: 1_288_490_189, fileBytesAllowed: 5 * 1024 ** 3 },
  };
});

describe("ClassroomSettings", () => {
  it("shows how much file storage the community uses", () => {
    renderSettings();
    expect(screen.getByText("1.2 GB of 5 GB used")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: settings.storageTitle }),
    ).toHaveAttribute("aria-valuenow", "24");
  });

  it("asks who can upload files to courses", () => {
    renderSettings();
    expect(screen.getByText(settings.uploadPolicyTitle)).toBeInTheDocument();
    expect(screen.getByText(settings.uploadPolicySubtitle)).toBeInTheDocument();
  });

  it("turns the bar red only once the allowance is really used up", () => {
    const allowed = 5 * 1024 ** 3;
    // Just over 99.5%: the shown percent rounds to 100, the bar stays neutral.
    m.usage = {
      data: {
        fileBytesStored: Math.round(allowed * 0.9951),
        fileBytesAllowed: allowed,
      },
    };
    renderSettings();
    const indicator = () =>
      document.querySelector('[data-slot="progress-indicator"]');
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(indicator()).not.toHaveClass("bg-destructive");
  });

  it("turns the bar red when the allowance is used up", () => {
    const allowed = 5 * 1024 ** 3;
    m.usage = { data: { fileBytesStored: allowed, fileBytesAllowed: allowed } };
    renderSettings();
    expect(
      document.querySelector('[data-slot="progress-indicator"]'),
    ).toHaveClass("bg-destructive");
  });

  it("says the storage use didn't load, and retries", () => {
    const refetch = vi.fn();
    m.usage = { data: undefined, isError: true, refetch };
    renderSettings();
    expect(screen.getByRole("alert")).toHaveTextContent(settings.storageFailed);
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: settings.tryAgain }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows no storage bar until the usage is known", () => {
    m.usage = { data: undefined };
    renderSettings();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
