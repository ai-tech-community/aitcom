"use client";

import { forwardRef, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * One icon action in the post editor's toolbar: an icon-only ghost button
 * whose name is both its accessible label and its tooltip.
 */
export const ToolbarButton = forwardRef<
  HTMLButtonElement,
  Omit<ComponentProps<typeof Button>, "children"> & {
    label: string;
    icon: ReactNode;
    /** Shown in the tooltip after the label, e.g. "Ctrl+B". */
    shortcut?: string;
  }
>(function ToolbarButton({ label, icon, shortcut, ...props }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground"
          {...props}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {shortcut ? `${label} · ${shortcut}` : label}
      </TooltipContent>
    </Tooltip>
  );
});

/** A thin divider between groups of toolbar buttons. */
export function ToolbarSeparator() {
  return (
    <span aria-hidden="true" className="bg-border mx-1 h-5 w-px self-center" />
  );
}

/**
 * Names the Ctrl/Cmd+Enter shortcut on a form's send button: a tooltip
 * for pointer users and `aria-keyshortcuts` (set on the button) for screen
 * readers. The tooltip sits on a wrapper so it also shows while the button
 * is disabled.
 */
export function ShortcutHint({
  hint,
  children,
}: {
  hint: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/** For `aria-keyshortcuts` on a form's send button. */
export const SEND_SHORTCUTS = "Control+Enter Meta+Enter";
