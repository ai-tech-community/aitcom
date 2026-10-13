"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { NewsRumorForm } from "./news-rumor-form";

export function NewsRumorDialog({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <NewsRumorForm showHeading={false} />
      </DialogContent>
    </Dialog>
  );
}
