"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const NewsRumorForm = dynamic(
  () => import("./news-rumor-form").then((mod) => mod.NewsRumorForm),
  {
    loading: () => <Spinner className="motion-reduce:animate-none" />,
  },
);

export function NewsRumorDialog({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <NewsRumorForm showHeading={false} onSubmitted={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
