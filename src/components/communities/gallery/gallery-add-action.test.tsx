import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import {
  GalleryAddAction,
  type GalleryViewerState,
} from "./gallery-add-action";

const m = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  joinProps: [] as unknown[],
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: m.requireAuth,
    promptAuth: vi.fn(),
    authStatus: "guest",
  }),
}));
vi.mock("../join-button", () => ({
  JoinButton: (props: unknown) => {
    m.joinProps.push(props);
    return <button type="button">Join community</button>;
  },
}));

function renderAction(viewer: GalleryViewerState, onUpload = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GalleryAddAction
        slug="mlops"
        communityName="MLOps Amsterdam"
        joinPolicy="open"
        viewer={viewer}
        onUpload={onUpload}
      />
    </NextIntlClientProvider>,
  );
  return { onUpload };
}

const ADD = { name: "Add photos and videos" };

beforeEach(() => {
  m.requireAuth.mockReset();
  m.joinProps = [];
});

describe("GalleryAddAction", () => {
  it("is the screen's one primary action for a member, and opens the upload", () => {
    const { onUpload } = renderAction({ kind: "member", role: "member" });
    const button = screen.getByRole("button", ADD);
    expect(button).toHaveAttribute("data-variant", "default");
    fireEvent.click(button);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("asks a guest to sign in instead of opening the upload", () => {
    const { onUpload } = renderAction({ kind: "guest" });
    fireEvent.click(screen.getByRole("button", ADD));
    expect(m.requireAuth).toHaveBeenCalledWith(
      expect.any(Function),
      "Sign in to add photos and videos",
    );
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("leaves the orange to the community's Join for anyone not a member", () => {
    renderAction({ kind: "guest" });
    expect(screen.getByRole("button", ADD)).toHaveAttribute(
      "data-variant",
      "ink",
    );
  });

  it("offers a signed-in visitor the community's join control", () => {
    const { onUpload } = renderAction({ kind: "outsider", status: null });
    fireEvent.click(screen.getByRole("button", ADD));
    const dialog = screen.getByRole("dialog", {
      name: "Join to add photos and videos",
    });
    expect(
      within(dialog).getByText("Only members can add to this gallery."),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Join community" }),
    ).toBeVisible();
    expect(m.joinProps.at(-1)).toMatchObject({
      slug: "mlops",
      joinPolicy: "open",
      membershipStatus: null,
    });
    expect(onUpload).not.toHaveBeenCalled();
    expect(m.requireAuth).not.toHaveBeenCalled();
  });

  it("offers an invited visitor the join control too", () => {
    renderAction({ kind: "outsider", status: "invited" });
    expect(screen.getByRole("button", ADD)).toBeVisible();
  });

  it.each([
    ["while the viewer is still unknown", { kind: "loading" }],
    ["to a pending request", { kind: "outsider", status: "pending_approval" }],
    ["to a banned visitor", { kind: "outsider", status: "banned" }],
  ] as const)("shows nothing %s", (_name, viewer) => {
    renderAction(viewer as GalleryViewerState);
    expect(screen.queryByRole("button", ADD)).toBeNull();
  });

  it("shows nothing to a visitor of an invite-only community", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <GalleryAddAction
          slug="mlops"
          joinPolicy="invite_only"
          viewer={{ kind: "outsider", status: null }}
          onUpload={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("button", ADD)).toBeNull();
  });
});
