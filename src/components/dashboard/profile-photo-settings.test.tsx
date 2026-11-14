import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const m = vi.hoisted(() => ({
  removeMutate: vi.fn(),
  removeOptions: {} as { onSuccess?: () => Promise<void> },
  invalidate: vi.fn(),
  refetchSession: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      members: { getMyProfile: { invalidate: m.invalidate } },
    }),
    members: {
      removeProfilePhoto: {
        useMutation: (options: { onSuccess?: () => Promise<void> }) => {
          m.removeOptions = options;
          return { mutate: m.removeMutate, isPending: false };
        },
      },
    },
  },
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ refetch: m.refetchSession }) },
}));
vi.mock("sonner", () => ({ toast: m.toast }));

import { ProfilePhotoSettings } from "./profile-photo-settings";

const copy = en.dashboard.profile.photo;
const fetchMock = vi.fn();

function renderRow(photo = { url: null as string | null, isSet: false }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ProfilePhotoSettings name="Ada Lovelace" photo={photo} />
    </NextIntlClientProvider>,
  );
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText(copy.choose), {
    target: { files: [file] },
  });
}

const png = () =>
  new File([new Uint8Array([1, 2, 3])], "me.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  m.invalidate.mockResolvedValue(undefined);
  m.refetchSession.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ image: "https://s3/t1.png" }), {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ProfilePhotoSettings", () => {
  it("offers an upload, and no remove, to a member without a picture", () => {
    renderRow();
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.upload }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: copy.remove }),
    ).not.toBeInTheDocument();
  });

  it("uploads the chosen file and refreshes every place that shows it", async () => {
    renderRow();
    const file = png();
    choose(file);

    await waitFor(() =>
      expect(m.toast.success).toHaveBeenCalledWith(copy.saved),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/profile-photo");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBe(file);
    expect(m.invalidate).toHaveBeenCalled();
    expect(m.refetchSession).toHaveBeenCalled();
  });

  it("refuses a picture type we do not store before uploading", async () => {
    renderRow();
    choose(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    await waitFor(() =>
      expect(m.toast.error).toHaveBeenCalledWith(copy.errorType),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a picture the server finds too large", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "x", reason: "size" }), {
        status: 400,
      }),
    );
    renderRow();
    choose(png());
    await waitFor(() =>
      expect(m.toast.error).toHaveBeenCalledWith(copy.errorSize),
    );
    expect(m.invalidate).not.toHaveBeenCalled();
  });

  it("removes the member's picture and refreshes", async () => {
    renderRow({ url: "https://s3/t1.png", isSet: true });
    expect(
      screen.getByRole("button", { name: copy.change }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.remove }));
    expect(m.removeMutate).toHaveBeenCalledTimes(1);

    await m.removeOptions.onSuccess?.();
    expect(m.invalidate).toHaveBeenCalled();
    expect(m.refetchSession).toHaveBeenCalled();
    expect(m.toast.success).toHaveBeenCalledWith(copy.removed);
  });
});
