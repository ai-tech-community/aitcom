import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

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

  it("answers a pending question no when a new one is asked", async () => {
    renderWith(<Asker />);
    let first!: Promise<boolean>;
    act(() => {
      first = confirm({ description: "First?" });
    });
    act(() => {
      void confirm({ description: "Second?" });
    });

    await expect(first).resolves.toBe(false);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Second?");
  });
});
