import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const route = vi.hoisted(() => ({ pathname: "/en/communities/belong" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

import { PortalContainerProvider } from "@/components/ui/portal-container";
import en from "../../messages/en.json";

import { ConfirmProvider, useConfirm } from "./confirm-dialog";

let confirm!: ReturnType<typeof useConfirm>;
function Asker() {
  confirm = useConfirm();
  return null;
}

/** A part of the page with its own floating layer, as a community look has. */
function Layered() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <>
      <div data-testid="layer" ref={setHost} />
      <PortalContainerProvider container={host}>
        <Asker />
      </PortalContainerProvider>
    </>
  );
}

function tree(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </NextIntlClientProvider>
  );
}

function renderWith(children: React.ReactNode) {
  route.pathname = "/en/communities/belong";
  return render(tree(children));
}

describe("useConfirm", () => {
  it("opens in the floating layer of the part of the page that asked", () => {
    renderWith(<Layered />);

    act(() => {
      void confirm({ description: "Delete this photo?" });
    });
    expect(screen.getByTestId("layer")).toContainElement(
      screen.getByRole("alertdialog"),
    );
  });

  it("opens on body when asked from outside any layer", () => {
    const { container } = renderWith(<Asker />);

    act(() => {
      void confirm({ description: "Delete this photo?" });
    });
    const dialog = screen.getByRole("alertdialog");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("resolves true when confirmed", async () => {
    renderWith(<Layered />);

    let answer!: Promise<boolean>;
    act(() => {
      answer = confirm({ description: "Delete this photo?" });
    });
    act(() => screen.getByRole("button", { name: "Confirm" }).click());
    await expect(answer).resolves.toBe(true);
  });

  it("answers no and closes when the page changes, so it never outlives its layer", async () => {
    const { rerender } = renderWith(<Layered />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = confirm({ description: "Delete this photo?" });
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Leaving the community: the page changes and its layer goes away.
    route.pathname = "/en/auth/signin";
    rerender(tree(null));

    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});
