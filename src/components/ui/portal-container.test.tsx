import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
 * floating primitive gets a row here; the source check below catches one
 * that forgets `container`.
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

/** Every `.ts` and `.tsx` source file under `dir`, tests excluded. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(dir, file));
}

/** The argument text of every `createPortal(...)` call in `source`. */
function createPortalCalls(source: string): string[] {
  const calls: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("createPortal(", from);
    if (start === -1) return calls;
    let depth = 0;
    let end = start + "createPortal".length;
    for (; end < source.length; end += 1) {
      if (source[end] === "(") depth += 1;
      if (source[end] === ")" && --depth === 0) break;
    }
    calls.push(source.slice(start + "createPortal(".length, end));
    from = end;
  }
}

/**
 * Hand-made portals that must stay in the house look: the site chrome is
 * never inside a community look.
 */
const HOUSE_PORTALS = ["src/components/navbar.tsx"];

describe("floating layers across the app", () => {
  const root = process.cwd();
  const sources = sourcesUnder(join(root, "src")).map((file) => ({
    path: file.slice(root.length + 1),
    source: readFileSync(file, "utf8"),
  }));

  it("pass the provided container to every Radix portal", () => {
    const missing: string[] = [];
    let portals = 0;
    for (const { path, source } of sources) {
      // An opening `<X.Portal …>` or `<Portal …>` tag (any import name),
      // allowing `=>` inside attribute expressions.
      for (const match of source.matchAll(
        /<(?:[A-Za-z]+\.)?Portal\b(?:[^>]|=>)*>/g,
      )) {
        portals += 1;
        const passesHook =
          match[0].includes("container={") &&
          source.includes("usePortalContainer()");
        if (!passesHook) missing.push(`${path}: ${match[0]}`);
      }
    }
    // The check found the portals it guards (one per primitive above).
    expect(portals).toBeGreaterThanOrEqual(FLOATING.length);
    expect(missing).toEqual([]);
  });

  it("mount every hand-made portal in the provided container", () => {
    const missing: string[] = [];
    for (const { path, source } of sources) {
      if (HOUSE_PORTALS.includes(path)) continue;
      for (const call of createPortalCalls(source)) {
        // The target is the last argument: it must fall back to `body`
        // only after the provided container.
        const args = call.trim().replace(/,$/, "");
        const target = args.slice(args.lastIndexOf(",") + 1).trim();
        if (!/\?\?\s*document\.body$/.test(target)) {
          missing.push(`${path}: createPortal(…, ${target})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
