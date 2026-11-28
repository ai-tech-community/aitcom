import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { PortalContainerProvider } from "./portal-container";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

function OpenPopover() {
  return (
    <Popover open>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Menu</PopoverContent>
    </Popover>
  );
}

/** A provider whose host is a div it renders, as a themed layer would be. */
function WithHost({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <>
      <div data-testid="host" ref={setHost} />
      <PortalContainerProvider container={host}>
        {children}
      </PortalContainerProvider>
    </>
  );
}

describe("PortalContainerProvider", () => {
  it("leaves floating layers on body outside a provider", () => {
    const { container } = render(<OpenPopover />);
    const content = screen.getByText("Menu");

    expect(container.contains(content)).toBe(false);
    expect(document.body.contains(content)).toBe(true);
  });

  it("mounts a popover in the provided host", () => {
    render(
      <WithHost>
        <OpenPopover />
      </WithHost>,
    );

    expect(screen.getByTestId("host")).toContainElement(
      screen.getByText("Menu"),
    );
  });

  it("mounts a tooltip in the provided host", () => {
    render(
      <WithHost>
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger>Hint</TooltipTrigger>
            <TooltipContent>Tip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </WithHost>,
    );

    const host = screen.getByTestId("host");
    expect(
      screen.getAllByText("Tip text").every((node) => host.contains(node)),
    ).toBe(true);
  });
});
