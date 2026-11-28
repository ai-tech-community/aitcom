import { useEffect, useState } from "react";
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

  it("keeps a question the new page asks as it mounts", () => {
    route.pathname = "/en/communities/belong";
    const { rerender } = render(tree(null));

    function AsksOnMount() {
      const ask = useConfirm();
      useEffect(() => {
        void ask({ description: "Leave without saving?" });
      }, [ask]);
      return null;
    }
    route.pathname = "/en/communities/belong/settings";
    rerender(tree(<AsksOnMount />));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("on leaving, answers only the old page's question, not the new page's", async () => {
    route.pathname = "/en/communities/belong";
    const { rerender } = render(tree(<Asker />));
    let oldAnswer!: Promise<boolean>;
    act(() => {
      oldAnswer = confirm({ description: "Discard the draft?" });
    });

    // Back to a page that asks its own question as it mounts.
    let newAnswer: boolean | undefined;
    function AsksOnMount() {
      const ask = useConfirm();
      useEffect(() => {
        void ask({ description: "Leave without saving?" }).then((value) => {
          newAnswer = value;
        });
      }, [ask]);
      return null;
    }
    route.pathname = "/en/communities/belong/settings";
    rerender(tree(<AsksOnMount />));

    await expect(oldAnswer).resolves.toBe(false);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Leave without saving?",
    );
    await Promise.resolve();
    expect(newAnswer).toBeUndefined();
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
