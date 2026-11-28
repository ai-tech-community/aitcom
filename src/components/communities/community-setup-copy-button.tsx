"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const setupOutlineAction =
  "focus-visible:outline-foreground h-auto min-h-11 min-w-0 whitespace-normal shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none";

export function CommunitySetupCopyButton({
  href,
  label,
  inputLabel,
  copied,
  copyError,
  className,
  secondary = false,
}: {
  href: string;
  label: string;
  inputLabel: string;
  copied: string;
  copyError: string;
  className?: string;
  secondary?: boolean;
}) {
  const [manualCopy, setManualCopy] = useState<string>();
  return (
    <>
      <Button
        type="button"
        variant={secondary ? "ghost" : "outline"}
        className={cn(setupOutlineAction, className)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(href);
            setManualCopy(undefined);
            toast.success(copied);
          } catch {
            setManualCopy(href);
            toast.error(copyError);
          }
        }}
      >
        <Copy aria-hidden="true" />
        {label}
      </Button>
      {manualCopy === href && (
        <Input
          autoFocus
          readOnly
          dir="ltr"
          aria-label={inputLabel}
          className="border-muted-foreground col-span-full h-11"
          value={href}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </>
  );
}
