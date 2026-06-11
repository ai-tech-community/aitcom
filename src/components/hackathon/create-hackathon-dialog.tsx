"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateHackathonDialog({
  communitySlug,
}: {
  communitySlug: string;
}) {
  const t = useTranslations("hackathon");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [teamMin, setTeamMin] = useState(1);
  const [teamMax, setTeamMax] = useState(5);

  const create = api.hackathon.createHackathon.useMutation({
    onSuccess: (res) => {
      setOpen(false);
      router.push(
        `/communities/${res.communitySlug}/events/${res.eventSlug}/manage`,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{t("createHackathonCta")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder={t("description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            placeholder={t("location")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={1}
              placeholder={t("teamMin")}
              value={teamMin}
              onChange={(e) => setTeamMin(Number(e.target.value) || 1)}
            />
            <Input
              type="number"
              min={1}
              placeholder={t("teamMax")}
              value={teamMax}
              onChange={(e) => setTeamMax(Number(e.target.value) || 1)}
            />
          </div>
          <Button
            className="w-full"
            disabled={
              create.isPending ||
              name.trim().length < 3 ||
              !date ||
              !location.trim()
            }
            onClick={() =>
              create.mutate({
                communitySlug,
                name: name.trim(),
                description: description.trim() || undefined,
                date,
                location: location.trim(),
                teamMin,
                teamMax,
              })
            }
          >
            {t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
