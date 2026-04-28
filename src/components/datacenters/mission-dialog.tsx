"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MissionDialog({
  variant = "ghost",
  size = "sm",
  label = "Why this investigation?",
}: {
  variant?: "ghost" | "outline" | "default" | "secondary";
  size?: "sm" | "default" | "lg";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <span aria-hidden>ⓘ</span>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Why we investigate the AI economy
          </DialogTitle>
          <DialogDescription>
            Community research, open data, member verification.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p>
            The AI build-out is unprecedented in <strong>scale</strong> and{" "}
            <strong>capital</strong>. Humanity has never deployed infrastructure
            of this size, this fast, with this much concentration of power,
            water, money, and influence in so few hands.
          </p>
          <p>
            We are not anti-AI. We want it to grow. But growth without
            visibility is how communities lose their power grids, their
            aquifers, their tax base, and their voice — before anyone notices.
          </p>
          <div className="border-border bg-muted/30 rounded-lg border p-4">
            <p className="font-medium">What this dashboard does</p>
            <ul className="text-muted-foreground mt-2 flex list-disc flex-col gap-1 pl-5 text-xs">
              <li>
                Maps every announced AI datacenter — operators, suppliers, power
                source, water draw, energy deals.
              </li>
              <li>
                Surfaces concentration risk (one operator dominates a country),
                single-supplier dependencies, and commitment-vs- actual gaps
                (greenwash).
              </li>
              <li>
                Flags facilities with no public sources, stuck announcements,
                and undisclosed power mix.
              </li>
              <li>
                Lets any member submit findings, dispute claims, and add sourced
                facts.
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium">What we ask of you</p>
            <p className="text-muted-foreground mt-1">
              Click into the panels. Drill into a country, an operator, a
              supplier. If something looks off — submit a finding. If something
              is missing — add it. Investigation is a community act, not a
              spectator sport.
            </p>
          </div>
          <p className="text-muted-foreground/80 border-t pt-3 text-xs italic">
            Responsible growth, without compromise of our humanity.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
