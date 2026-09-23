"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StartupsMap } from "@/components/investigations/startups-map";
import type { StartupMapPin } from "@/lib/investigations/startups";

export function StartupsMapSheet({
  pins,
  copy,
}: {
  pins: StartupMapPin[];
  copy: {
    openMap: string;
    title: string;
    close: string;
    empty: string;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          {copy.openMap}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle>{copy.title}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4">
          {pins.length === 0 ? (
            <EmptyState title={copy.empty} />
          ) : open ? (
            <StartupsMap pins={pins} />
          ) : null}
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="outline">
              {copy.close}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
