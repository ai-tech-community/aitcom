import { useState, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { PortalContainerProvider } from "./portal-container";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

/**
 * Every floating primitive in `ui/`, open, with the text it shows. A new
 * floating primitive gets a row here, so it cannot lose `container`.
 */
const FLOATING: [name: string, layer: ReactNode][] = [
  [
    "dialog",
    <Dialog key="dialog" open>
      <DialogContent>
        <DialogTitle>Floating</DialogTitle>
        <DialogDescription>Dialog body</DialogDescription>
      </DialogContent>
    </Dialog>,
  ],
  [
    "alert dialog",
    <AlertDialog key="alert" open>
      <AlertDialogContent>
        <AlertDialogTitle>Floating</AlertDialogTitle>
        <AlertDialogDescription>Alert body</AlertDialogDescription>
      </AlertDialogContent>
    </AlertDialog>,
  ],
  [
    "sheet",
    <Sheet key="sheet" open>
      <SheetContent>
        <SheetTitle>Floating</SheetTitle>
        <SheetDescription>Sheet body</SheetDescription>
      </SheetContent>
    </Sheet>,
  ],
  [
    "dropdown menu",
    <DropdownMenu key="menu" open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Floating</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  ],
  [
    "popover",
    <Popover key="popover" open>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Floating</PopoverContent>
    </Popover>,
  ],
  [
    "hover card",
    <HoverCard key="hover" open>
      <HoverCardTrigger>Open</HoverCardTrigger>
      <HoverCardContent>Floating</HoverCardContent>
    </HoverCard>,
  ],
  [
    "select",
    <Select key="select" open>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Floating</SelectItem>
      </SelectContent>
    </Select>,
  ],
  [
    "tooltip",
    <TooltipProvider key="tooltip">
      <Tooltip open>
        <TooltipTrigger>Open</TooltipTrigger>
        <TooltipContent>Floating</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  ],
];

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}

/** A provider whose host is a div it renders, as a themed layer would be. */
function WithHost({ children }: { children: ReactNode }) {
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

/** Every node showing "Floating" (Select and Tooltip render a copy). */
function floatingNodes(): HTMLElement[] {
  return screen.getAllByText("Floating");
}

describe("PortalContainerProvider", () => {
  // Radix Select scrolls its selected option into view; jsdom has no layout.
  const scroll = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterAll(() => {
    if (scroll)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it.each(FLOATING)(
    "leaves a %s on body outside a provider",
    (_name, layer) => {
      const { container } = render(withIntl(layer));
      const nodes = floatingNodes();

      expect(nodes.some((node) => container.contains(node))).toBe(false);
      expect(nodes.every((node) => document.body.contains(node))).toBe(true);
    },
  );

  it.each(FLOATING)("mounts a %s in the provided host", (_name, layer) => {
    render(withIntl(<WithHost>{layer}</WithHost>));
    const host = screen.getByTestId("host");

    expect(floatingNodes().every((node) => host.contains(node))).toBe(true);
  });
});
